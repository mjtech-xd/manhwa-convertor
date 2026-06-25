// Stage-timing telemetry (CLAUDE.md §12). Subscribes to the EventBus,
// pairs each stage's `start` with its `end`, and keeps a rolling window
// of durations per stage from which it derives p50/p95 — surfaced in the
// Debug panel via STAGE_TIMING_PORT.
//
// Root singleton, eagerly created by provideInfrastructure() so it
// captures every run regardless of whether the Debug panel is open.
// Only successful stages (`end`) are recorded; `error` clears the pending
// start so a failed stage doesn't skew the percentiles.

import { Injectable, computed, inject, signal } from '@angular/core';
import {
  EVENT_BUS_PORT,
  type StageEvent,
  type StageTimingPort,
  type StageTimingSummary,
} from '@mc/domain';

type Stage = StageEvent['stage'];

// Cap retained samples per stage so a long bulk run can't grow unbounded.
const MAX_SAMPLES = 200;

@Injectable({ providedIn: 'root' })
export class StageTimingService implements StageTimingPort {
  private readonly bus = inject(EVENT_BUS_PORT);

  // stage -> recent durations (ms), oldest first.
  private readonly samples = signal<ReadonlyMap<Stage, readonly number[]>>(new Map());
  // `${stage}|${chapterId}` -> start tsMs, awaiting its matching end.
  private readonly pending = new Map<string, number>();

  readonly summary = computed<readonly StageTimingSummary[]>(() => {
    const out: StageTimingSummary[] = [];
    for (const [stage, durations] of this.samples()) {
      if (durations.length === 0) continue;
      const sorted = [...durations].sort((a, b) => a - b);
      out.push({
        stage,
        count: sorted.length,
        p50Ms: percentile(sorted, 50),
        p95Ms: percentile(sorted, 95),
        lastMs: durations[durations.length - 1] as number,
      });
    }
    return out;
  });

  constructor() {
    // Root singleton lives for the app lifetime; no unsubscribe needed.
    this.bus.onStage((e) => this.record(e));
  }

  reset(): void {
    this.pending.clear();
    this.samples.set(new Map());
  }

  private record(e: StageEvent): void {
    const key = `${e.stage}|${e.chapterId ?? ''}`;
    if (e.phase === 'start') {
      this.pending.set(key, e.tsMs);
      return;
    }
    if (e.phase === 'error') {
      this.pending.delete(key);
      return;
    }
    if (e.phase !== 'end') return;

    const start = this.pending.get(key);
    if (start === undefined) return;
    this.pending.delete(key);

    const durationMs = Math.max(0, e.tsMs - start);
    const next = new Map(this.samples());
    const prior = next.get(e.stage) ?? [];
    const grown = [...prior, durationMs];
    next.set(e.stage, grown.length > MAX_SAMPLES ? grown.slice(-MAX_SAMPLES) : grown);
    this.samples.set(next);
  }
}

/** Nearest-rank percentile over an ascending-sorted array. */
export function percentile(sortedAsc: readonly number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0] as number;
  const rank = Math.ceil((p / 100) * sortedAsc.length);
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, rank - 1));
  return sortedAsc[idx] as number;
}
