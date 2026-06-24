import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { BLOB_REGISTRY_PORT, type BlobRegistryPort } from 'domain';
import { TtsModeStore, type LineStatus } from './tts-mode.store';

@Component({
  selector: 'mc-tts-mode-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, NgIcon],
  template: `
    <section class="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <header class="flex items-start justify-between gap-4">
        <div>
          <h2 class="m-0 text-xl">TTS mode</h2>
          <p class="m-0 mt-1 text-sm text-mc-text-muted">
            Render a script to MP3 + SRT via ai33.pro. Each non-empty line becomes one voice segment.
          </p>
        </div>
        @if (store.renderStatus() !== 'idle') {
          <button
            type="button"
            (click)="store.reset()"
            [disabled]="store.renderStatus() === 'running'"
            class="flex items-center gap-1.5 rounded border border-mc-border bg-transparent px-3 py-1.5 text-sm text-mc-text hover:bg-mc-bg-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ng-icon name="lucideRefreshCcw" size="0.9rem" />
            Reset
          </button>
        }
      </header>

      <!-- Script input -->
      <section class="flex flex-col gap-2">
        <label class="text-sm font-medium text-mc-text" for="tts-script">
          Script
          @if (lineCount() > 0) {
            <span class="ml-2 font-normal text-mc-text-muted">({{ lineCount() }} line{{ lineCount() === 1 ? '' : 's' }})</span>
          }
        </label>
        <textarea
          id="tts-script"
          rows="10"
          [value]="store.script()"
          (input)="onScriptInput($event)"
          [disabled]="store.renderStatus() === 'running'"
          placeholder="Paste your script here. Each non-empty line becomes one voice segment."
          class="w-full resize-y rounded-lg border border-mc-border bg-mc-bg p-3 font-sans text-sm leading-relaxed text-mc-text outline-none placeholder:text-mc-text-faint focus:border-mc-accent disabled:opacity-60"
        ></textarea>
      </section>

      <!-- Voice picker -->
      <section class="flex flex-col gap-2">
        <div class="flex items-center gap-2">
          <label class="text-sm font-medium text-mc-text" for="tts-voice">Voice</label>
          <button
            type="button"
            (click)="store.loadVoices()"
            [disabled]="store.voicesStatus() === 'loading'"
            class="flex items-center gap-1 rounded border border-mc-border px-2 py-0.5 text-xs text-mc-text-muted hover:bg-mc-bg-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ng-icon name="lucideRefreshCcw" size="0.75rem" />
            {{ store.voicesStatus() === 'loading' ? 'Loading…' : 'Load voices' }}
          </button>
        </div>

        @if (store.voicesStatus() === 'failed') {
          <p class="m-0 flex items-center gap-1.5 text-sm text-mc-danger">
            <ng-icon name="lucideTriangleAlert" size="0.9rem" />{{ store.voicesError() }}
          </p>
        }

        @if (store.voices().length > 0) {
          <select
            id="tts-voice"
            [value]="store.selectedVoiceId()"
            (change)="onVoiceChange($event)"
            class="w-full rounded-lg border border-mc-border bg-mc-bg px-3 py-2 text-sm text-mc-text outline-none focus:border-mc-accent"
          >
            @for (v of store.voices(); track v.id) {
              <option [value]="v.id">{{ v.name }}</option>
            }
          </select>
        } @else if (store.voicesStatus() === 'idle') {
          <div class="flex items-center gap-2">
            <input
              id="tts-voice"
              type="text"
              [value]="store.selectedVoiceId()"
              (input)="onVoiceIdInput($event)"
              placeholder="Enter voice ID manually (e.g. from ElevenLabs)"
              class="flex-1 rounded-lg border border-mc-border bg-mc-bg px-3 py-2 text-sm text-mc-text outline-none focus:border-mc-accent"
            />
          </div>
          <p class="m-0 text-xs text-mc-text-faint">
            Click "Load voices" to fetch the catalog, or enter a voice ID manually.
          </p>
        }
      </section>

      <!-- Render controls -->
      <div class="flex items-center gap-2">
        @if (store.renderStatus() === 'idle' || store.renderStatus() === 'done' || store.renderStatus() === 'failed' || store.renderStatus() === 'cancelled') {
          <button
            type="button"
            [disabled]="!canRender()"
            (click)="render()"
            class="flex items-center gap-1.5 rounded bg-mc-accent px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ng-icon name="lucideMic" size="0.9rem" />
            {{ store.renderStatus() === 'done' ? 'Re-render' : 'Render' }}
          </button>
        }
        @if (store.renderStatus() === 'running') {
          <button
            type="button"
            (click)="store.cancel()"
            [disabled]="store.cancelRequested()"
            class="flex items-center gap-1.5 rounded border border-mc-border bg-transparent px-4 py-2 text-sm text-mc-text hover:bg-mc-bg-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ng-icon name="lucideX" size="0.9rem" />
            {{ store.cancelRequested() ? 'Cancelling…' : 'Cancel' }}
          </button>
        }
        @if (store.renderStatus() === 'running') {
          <span class="text-sm text-mc-text-muted">
            {{ store.doneCount() }} / {{ store.lines().length }} lines done
            @if (store.failedCount() > 0) {
              · {{ store.failedCount() }} failed
            }
          </span>
        }
      </div>

      <!-- Per-line progress -->
      @if (store.lines().length > 0) {
        <section>
          <h3 class="m-0 mb-2 text-base">Lines ({{ store.lines().length }})</h3>
          <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
            @for (line of store.lines(); track line.index) {
              <li class="rounded-lg border border-mc-border bg-mc-bg-elev px-3 py-2">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <p class="m-0 truncate text-sm text-mc-text">{{ line.text }}</p>
                    @if (line.error) {
                      <p class="m-0 mt-0.5 flex items-center gap-1.5 text-xs text-mc-danger">
                        <ng-icon name="lucideTriangleAlert" size="0.75rem" />{{ line.error }}
                      </p>
                    }
                  </div>
                  <span [class]="lineStatusClass(line.status)">{{ line.status }}</span>
                </div>
              </li>
            }
          </ul>
        </section>
      }

      <!-- Output download -->
      @if (store.renderStatus() === 'done' && store.mp3Ref()) {
        <section class="rounded-lg border border-mc-border bg-mc-bg-elev p-4">
          <h3 class="m-0 mb-3 text-base font-medium">Output</h3>
          <div class="flex flex-wrap items-center gap-2">
            <a
              class="flex items-center gap-2 rounded bg-mc-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              [attr.href]="mp3Url()"
              [attr.download]="store.suggestedName()"
            >
              <ng-icon name="lucideDownload" size="0.9rem" />
              {{ store.suggestedName() }}
            </a>
            @if (store.srtText()) {
              <a
                class="flex items-center gap-2 rounded border border-mc-border px-4 py-2 text-sm text-mc-text hover:bg-mc-bg-hover"
                [attr.href]="srtUrl()"
                [attr.download]="srtName()"
              >
                <ng-icon name="lucideDownload" size="0.9rem" />
                {{ srtName() }}
              </a>
            }
            @if (store.durationSec(); as dur) {
              <span class="text-sm text-mc-text-muted">{{ formatDuration(dur) }}</span>
            }
          </div>
          @if (store.failedCount() > 0) {
            <p class="m-0 mt-2 text-sm text-mc-text-muted">
              {{ store.failedCount() }} line{{ store.failedCount() === 1 ? '' : 's' }} failed — skipped in the output.
            </p>
          }
        </section>
      }
    </section>
  `,
})
export class TtsModePage {
  protected readonly store = inject(TtsModeStore);
  private readonly blobs = inject(BLOB_REGISTRY_PORT) as BlobRegistryPort;

  protected readonly lineCount = computed(() =>
    this.store.script().split('\n').filter((l) => l.trim().length > 0).length,
  );

  protected readonly canRender = computed(
    () => this.store.script().trim().length > 0 && this.store.selectedVoiceId().trim().length > 0,
  );

  onScriptInput(e: Event): void {
    this.store.setScript((e.target as HTMLTextAreaElement).value);
  }

  onVoiceChange(e: Event): void {
    this.store.selectVoice((e.target as HTMLSelectElement).value);
  }

  onVoiceIdInput(e: Event): void {
    this.store.selectVoice((e.target as HTMLInputElement).value);
  }

  render(): void {
    void this.store.render();
  }

  protected mp3Url = (): string | null => {
    const ref = this.store.mp3Ref();
    return ref ? this.blobs.url(ref) : null;
  };

  protected srtUrl = (): string | null => {
    const srt = this.store.srtText();
    if (!srt) return null;
    const bytes = new TextEncoder().encode(srt);
    const ref = this.blobs.put(bytes, 'text/srt');
    return this.blobs.url(ref);
  };

  protected srtName = (): string => {
    const name = this.store.suggestedName() ?? 'output.mp3';
    return name.replace(/\.mp3$/i, '.srt');
  };

  protected lineStatusClass(status: LineStatus): string {
    switch (status) {
      case 'done':    return 'shrink-0 rounded px-2 py-0.5 text-xs bg-mc-bg text-mc-text-muted';
      case 'running': return 'shrink-0 rounded px-2 py-0.5 text-xs bg-mc-accent text-white';
      case 'failed':  return 'shrink-0 rounded px-2 py-0.5 text-xs bg-mc-danger text-white';
      default:        return 'shrink-0 rounded px-2 py-0.5 text-xs bg-mc-bg text-mc-text-faint';
    }
  }

  protected formatDuration(sec: number): string {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }
}
