// CPU worker pool (ADR-001 fulfilment).
//
// Rasterise + filter are CPU-bound and were running on the Electron main
// event loop (acceptable for single mode; a bottleneck at bulk-mode
// scale where N chapters compete for the loop). This pool moves both off
// the main thread into `node:worker_threads`.
//
// Behaviour (CLAUDE.md §11 "Memory"):
//   • Lazy spawn — no workers until the first task.
//   • Up to min(cpus-1, 4) workers; tasks queue when all are busy.
//   • Idle workers terminate after 60 s (unref'd timer — never blocks quit).
//   • A crashed worker rejects its in-flight task and is dropped; the next
//     dispatch respawns on demand.
//
// `runCpuTask` wraps `pool.run` with an inline fallback: if the worker
// path can't load (e.g. asar packaging quirk before Phase 7), the task
// still completes by running the service on the main thread. Correctness
// never depends on the worker succeeding.

import { Worker } from 'node:worker_threads';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// ESM has no __dirname — derive it from the module URL.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type CpuTaskType = 'rasterise' | 'filter';

interface PendingTask {
  readonly id: number;
  readonly type: CpuTaskType;
  readonly payload: unknown;
  readonly resolve: (value: unknown) => void;
  readonly reject: (err: unknown) => void;
}

interface PoolWorker {
  readonly worker: Worker;
  busy: boolean;
  current: PendingTask | null;
  idleTimer: NodeJS.Timeout | null;
}

// dist-electron/main/services/worker-pool.js → dist-electron/workers/cpu.worker.js
const WORKER_PATH = path.join(__dirname, '..', '..', 'workers', 'cpu.worker.js');
const MAX_WORKERS = Math.max(1, Math.min(4, os.cpus().length - 1));
const IDLE_TIMEOUT_MS = 60_000;

class WorkerPool {
  private readonly workers: PoolWorker[] = [];
  private readonly queue: PendingTask[] = [];
  private nextId = 1;

  run<T>(type: CpuTaskType, payload: unknown): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        id: this.nextId++,
        type,
        payload,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.dispatch();
    });
  }

  shutdown(): void {
    for (const pw of [...this.workers]) {
      this.clearIdle(pw);
      void pw.worker.terminate();
    }
    this.workers.length = 0;
  }

  private dispatch(): void {
    if (this.queue.length === 0) return;
    let pw = this.workers.find((w) => !w.busy);
    if (!pw && this.workers.length < MAX_WORKERS) pw = this.spawn();
    if (!pw) return; // all workers busy — task waits in the queue
    const task = this.queue.shift();
    if (task) this.assign(pw, task);
  }

  private spawn(): PoolWorker {
    const worker = new Worker(WORKER_PATH);
    const pw: PoolWorker = { worker, busy: false, current: null, idleTimer: null };
    worker.on('message', (msg: WorkerMessage) => this.onMessage(pw, msg));
    worker.on('error', (err: Error) => this.onFailure(pw, err));
    worker.on('exit', (code: number) => {
      if (code !== 0) this.onFailure(pw, new Error(`Worker exited with code ${code}`));
    });
    this.workers.push(pw);
    return pw;
  }

  private assign(pw: PoolWorker, task: PendingTask): void {
    pw.busy = true;
    pw.current = task;
    this.clearIdle(pw);
    pw.worker.postMessage({ id: task.id, type: task.type, payload: task.payload });
  }

  private onMessage(pw: PoolWorker, msg: WorkerMessage): void {
    const task = pw.current;
    if (!task || msg.id !== task.id) return;
    pw.busy = false;
    pw.current = null;
    if (msg.ok) task.resolve(msg.result);
    else task.reject(new Error(msg.error ?? 'CPU worker task failed'));
    this.scheduleIdle(pw);
    this.dispatch();
  }

  private onFailure(pw: PoolWorker, err: Error): void {
    if (pw.current) pw.current.reject(err);
    this.removeWorker(pw);
    this.dispatch(); // re-attempt queued work on a fresh worker
  }

  private removeWorker(pw: PoolWorker): void {
    this.clearIdle(pw);
    const i = this.workers.indexOf(pw);
    if (i >= 0) this.workers.splice(i, 1);
  }

  private scheduleIdle(pw: PoolWorker): void {
    this.clearIdle(pw);
    pw.idleTimer = setTimeout(() => {
      if (!pw.busy) {
        void pw.worker.terminate();
        this.removeWorker(pw);
      }
    }, IDLE_TIMEOUT_MS);
    pw.idleTimer.unref();
  }

  private clearIdle(pw: PoolWorker): void {
    if (pw.idleTimer) {
      clearTimeout(pw.idleTimer);
      pw.idleTimer = null;
    }
  }
}

interface WorkerMessage {
  readonly id: number;
  readonly ok: boolean;
  readonly result?: unknown;
  readonly error?: string;
}

const pool = new WorkerPool();

/**
 * Run a CPU task on the worker pool, falling back to inline execution on
 * the main thread if the worker can't load or crashes. The inline path
 * guarantees correctness regardless of worker health.
 */
export async function runCpuTask<T>(
  type: CpuTaskType,
  payload: unknown,
  inline: () => Promise<T>,
): Promise<T> {
  try {
    return await pool.run<T>(type, payload);
  } catch (err) {
    console.warn(`[worker-pool] ${type} failed in worker, running inline:`, err);
    return inline();
  }
}

export function shutdownWorkerPool(): void {
  pool.shutdown();
}
