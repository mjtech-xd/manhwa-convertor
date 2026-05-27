import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { FileDropComponent } from 'ui-kit';
import { BLOB_REGISTRY_PORT, type BlobRegistryPort } from 'domain';
import type { CheckpointSessionMeta } from 'domain';
import {
  BulkModeStore,
  type BulkChapter,
  type ChapterStatus,
  type QueueStatus,
} from './bulk-mode.store';

@Component({
  selector: 'mc-bulk-mode-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FileDropComponent, NgIcon],
  template: `
    <section class="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <header class="flex items-start justify-between gap-4">
        <div>
          <h2 class="m-0 text-xl">Bulk mode</h2>
          <p class="m-0 mt-1 text-sm text-mc-text-muted">
            Queue chapter PDFs and run them through the pipeline sequentially. Each chapter produces its own ZIP.
          </p>
        </div>
        <div class="flex items-center gap-2">
          @if (store.status() === 'idle' || store.status() === 'done' || store.status() === 'failed' || store.status() === 'cancelled') {
            <button
              type="button"
              [disabled]="store.chapters().length === 0"
              (click)="store.start()"
              class="flex items-center gap-1.5 rounded bg-mc-accent px-3 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ng-icon name="lucideCheck" size="0.9rem" />
              Start
            </button>
          }
          @if (store.status() === 'running') {
            <button
              type="button"
              (click)="store.cancel()"
              [disabled]="store.cancelRequested()"
              class="flex items-center gap-1.5 rounded border border-mc-border bg-transparent px-3 py-1.5 text-sm text-mc-text hover:bg-mc-bg-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ng-icon name="lucideX" size="0.9rem" />
              {{ store.cancelRequested() ? 'Cancelling…' : 'Cancel' }}
            </button>
          }
          @if (store.chapters().length > 0 && store.status() !== 'running') {
            <button
              type="button"
              (click)="store.reset()"
              class="flex items-center gap-1.5 rounded border border-mc-border bg-transparent px-3 py-1.5 text-sm text-mc-text hover:bg-mc-bg-hover"
            >
              <ng-icon name="lucideRefreshCcw" size="0.9rem" />
              Clear all
            </button>
          }
        </div>
      </header>

      @if (store.recoverable(); as rec) {
        <div class="flex items-start justify-between gap-3 rounded-lg border border-mc-border bg-mc-bg-elev p-3">
          <div class="flex items-start gap-2">
            <ng-icon name="lucideTriangleAlert" size="1rem" class="mt-0.5 text-mc-text-muted" />
            <div>
              <p class="m-0 text-sm font-medium text-mc-text">A previous bulk run was interrupted.</p>
              <p class="m-0 mt-0.5 text-xs text-mc-text-muted">
                {{ recoveredDoneCount(rec) }} of {{ rec.chapters.length }} chapters finished before it stopped (scripts saved to disk{{ rec.masterBible ? ', master bible recovered' : '' }}). Re-add the remaining PDFs to continue — finished chapters keep the same bible.
              </p>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <button
              type="button"
              (click)="store.resumeRecovery()"
              class="rounded bg-mc-accent px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"
            >
              Resume
            </button>
            <button
              type="button"
              (click)="store.discardRecovery()"
              class="rounded border border-mc-border px-2.5 py-1 text-xs text-mc-text-muted hover:border-mc-danger hover:text-mc-danger"
            >
              Discard
            </button>
          </div>
        </div>
      }

      <mc-file-drop
        label="Drop chapter PDFs (multiple)"
        hint="Each PDF becomes a queue row. Pipeline runs them in order."
        (filesPicked)="onFiles($event)"
      />

      @if (queueSummary(); as s) {
        <p class="m-0 text-sm text-mc-text-muted">{{ s }}</p>
      }

      @if (store.chapters().length > 0) {
        <section>
          <h3 class="m-0 mb-2 text-base">Queue ({{ store.chapters().length }})</h3>
          <ul class="m-0 flex list-none flex-col gap-2 p-0">
            @for (ch of store.chapters(); track ch.id; let i = $index) {
              <li class="rounded-lg border border-mc-border bg-mc-bg-elev p-3">
                <div class="flex items-center justify-between gap-3">
                  <div class="flex min-w-0 flex-1 items-center gap-3">
                    <span class="font-mono text-xs text-mc-text-faint">#{{ i + 1 }}</span>
                    <span class="truncate font-medium text-mc-text">{{ ch.name }}</span>
                    @if (ch.usedMasterBible) {
                      <span class="rounded bg-mc-bg px-1.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider text-mc-text-faint" title="Used master bible from chapter 1">MB</span>
                    }
                    @if (ch.recovered) {
                      <span class="rounded bg-mc-bg px-1.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider text-mc-text-faint" title="Recovered from an interrupted run">REC</span>
                    }
                    @if (ch.awaitingFile) {
                      <span class="text-xs italic text-mc-text-muted">awaiting PDF — re-add to continue</span>
                    }
                    @if (ch.currentStage && ch.status === 'running') {
                      <span class="text-xs text-mc-text-muted">{{ stageLabel(ch) }}</span>
                    }
                  </div>
                  <div class="flex shrink-0 items-center gap-2">
                    <span [class]="statusClass(ch.status)">{{ ch.status }}</span>
                    @if (ch.zipRef && ch.suggestedName) {
                      <a
                        class="flex items-center gap-1 rounded border border-mc-border px-2 py-1 text-xs text-mc-text hover:bg-mc-bg-hover"
                        [attr.href]="zipUrl(ch.zipRef)"
                        [attr.download]="ch.suggestedName"
                      >
                        <ng-icon name="lucideDownload" size="0.8rem" />
                        ZIP
                      </a>
                    }
                    @if (ch.recoveredScriptRef) {
                      <a
                        class="flex items-center gap-1 rounded border border-mc-border px-2 py-1 text-xs text-mc-text hover:bg-mc-bg-hover"
                        [attr.href]="zipUrl(ch.recoveredScriptRef)"
                        [attr.download]="scriptName(ch.name)"
                        title="Recovered script (no images — re-add the PDF for a full ZIP)"
                      >
                        <ng-icon name="lucideDownload" size="0.8rem" />
                        script.txt
                      </a>
                    }
                    @if (ch.status === 'pending' || ch.status === 'failed' || ch.status === 'cancelled' || ch.status === 'done') {
                      <button
                        type="button"
                        (click)="store.remove(ch.id)"
                        [disabled]="store.status() === 'running'"
                        class="rounded border border-mc-border px-2 py-1 text-xs text-mc-text-muted hover:border-mc-danger hover:text-mc-danger disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label="Remove"
                      >
                        <ng-icon name="lucideX" size="0.8rem" />
                      </button>
                    }
                  </div>
                </div>
                @if (ch.error) {
                  <p class="m-0 mt-2 flex items-center gap-1.5 text-xs text-mc-danger">
                    <ng-icon name="lucideTriangleAlert" size="0.8rem" />{{ ch.error }}
                  </p>
                }
              </li>
            }
          </ul>
        </section>
      }
    </section>
  `,
})
export class BulkModePage {
  protected readonly store = inject(BulkModeStore);
  private readonly blobs = inject(BLOB_REGISTRY_PORT) as BlobRegistryPort;

  constructor() {
    // Surface any interrupted run found on disk (no-op outside Electron).
    void this.store.checkForInterruptedSession();
  }

  recoveredDoneCount(rec: CheckpointSessionMeta): number {
    return rec.chapters.filter((c) => c.status === 'done').length;
  }

  protected readonly queueSummary = computed<string | null>(() => {
    const chapters = this.store.chapters();
    if (chapters.length === 0) return null;
    const done = chapters.filter((c) => c.status === 'done').length;
    const failed = chapters.filter((c) => c.status === 'failed').length;
    const cancelled = chapters.filter((c) => c.status === 'cancelled').length;
    const running = chapters.filter((c) => c.status === 'running').length;
    const awaiting = chapters.filter((c) => c.awaitingFile).length;
    const status = this.store.status();
    const parts = [
      `${chapters.length} chapter${chapters.length === 1 ? '' : 's'}`,
      done > 0 ? `${done} done` : null,
      failed > 0 ? `${failed} failed` : null,
      cancelled > 0 ? `${cancelled} cancelled` : null,
      running > 0 ? '1 running' : null,
      awaiting > 0 ? `${awaiting} awaiting PDF` : null,
    ].filter((p): p is string => p !== null);
    const prefix = status === 'running' ? 'Running — ' : status === 'idle' ? '' : `${status} — `;
    return `${prefix}${parts.join(' · ')}`;
  });

  onFiles(files: readonly File[]): void {
    this.store.add(files);
  }

  zipUrl(ref: string): string | null {
    return this.blobs.url(ref);
  }

  scriptName(chapterName: string): string {
    return `${chapterName.replace(/\.pdf$/i, '')}.script.txt`;
  }

  stageLabel(ch: BulkChapter): string {
    if (!ch.currentStage) return '';
    if (ch.currentStage === 'narrate' && ch.sceneCount && ch.scenesDone !== null) {
      return `narrate ${ch.scenesDone}/${ch.sceneCount}`;
    }
    return ch.currentStage;
  }

  statusClass(status: ChapterStatus | QueueStatus): string {
    switch (status) {
      case 'done':      return 'rounded px-2 py-0.5 text-xs bg-mc-bg text-mc-text-muted';
      case 'running':   return 'rounded px-2 py-0.5 text-xs bg-mc-accent text-white';
      case 'failed':    return 'rounded px-2 py-0.5 text-xs bg-mc-danger text-white';
      case 'cancelled': return 'rounded px-2 py-0.5 text-xs bg-mc-border text-mc-text-muted';
      default:          return 'rounded px-2 py-0.5 text-xs bg-mc-bg text-mc-text-faint';
    }
  }
}
