import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import {
  FileDropComponent,
  ImageGridComponent,
  ProgressRailComponent,
  type ImageGridItem,
  type ProgressStage,
} from 'ui-kit';
import { BLOB_REGISTRY_PORT, type BlobRegistryPort, type FilteredPage } from 'domain';
import { SingleModeStore, type SceneRow, type StageStatus } from './single-mode.store';

function stageStatus(s: StageStatus): ProgressStage['status'] {
  return s === 'idle' ? 'pending' : s;
}

function stage(label: string, status: ProgressStage['status'], hint: string | undefined): ProgressStage {
  return hint === undefined ? { label, status } : { label, status, hint };
}

@Component({
  selector: 'mc-single-mode-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FileDropComponent, ImageGridComponent, ProgressRailComponent, NgIcon],
  template: `
    <section class="page">
      <header class="header">
        <div>
          <h2>Single mode</h2>
          <p class="hint">Drop a chapter PDF. Pipeline runs extract → filter → bible → narrate → polish → structural → accuracy → assemble.</p>
        </div>
        @if (store.fileName(); as name) {
          <button
            type="button"
            (click)="store.reset()"
            class="flex items-center gap-1.5 rounded border border-mc-border bg-transparent px-3 py-1.5 text-sm text-mc-text hover:bg-mc-bg-hover"
          >
            <ng-icon name="lucideRefreshCcw" size="0.9rem" />
            Reset
          </button>
        }
      </header>

      @if (!store.fileName()) {
        <mc-file-drop (filesPicked)="onFiles($event)" />
      } @else {
        <p class="m-0 flex items-center gap-2 text-mc-text-muted">
          <ng-icon name="lucideFileText" size="1rem" />
          {{ store.fileName() }}
        </p>
      }

      <mc-progress-rail [stages]="stages()" />

      @if (store.bible.value(); as bible) {
        <section class="bible">
          <h3>Character bible</h3>
          <p><strong>Setting:</strong> {{ bible.setting }}</p>
          <p><strong>Tone:</strong> {{ bible.tone }}</p>
          <ul>
            @for (c of bible.characters; track c.name) {
              <li><strong>{{ c.name }}</strong> — {{ c.description }}</li>
            }
          </ul>
        </section>
      }

      @if (store.filter.pages().length > 0) {
        <section>
          <h3>Filtered pages ({{ keptCount() }} kept / {{ store.filter.pages().length }})</h3>
          <mc-image-grid [items]="filteredItems()" />
        </section>
      } @else if (store.extract.pages().length > 0) {
        <section>
          <h3>Extracted pages ({{ store.extract.pages().length }})</h3>
          <mc-image-grid [items]="extractedItems()" />
        </section>
      }

      @if (store.extract.error(); as e) {
        <p class="m-0 flex items-center gap-1.5 text-sm text-mc-danger">
          <ng-icon name="lucideTriangleAlert" size="0.9rem" />Extract failed: {{ e }}
        </p>
      }
      @if (store.filter.error(); as e) {
        <p class="m-0 flex items-center gap-1.5 text-sm text-mc-danger">
          <ng-icon name="lucideTriangleAlert" size="0.9rem" />Filter failed: {{ e }}
        </p>
      }
      @if (store.bible.error(); as e) {
        <p class="m-0 flex items-center gap-1.5 text-sm text-mc-danger">
          <ng-icon name="lucideTriangleAlert" size="0.9rem" />Bible failed: {{ e }}
        </p>
      }

      @if (store.narrate.scenes().length > 0) {
        <section>
          <h3>Scenes ({{ doneSceneCount() }} narrated / {{ store.narrate.scenes().length }})</h3>
          <ul class="m-0 flex list-none flex-col gap-2 p-0">
            @for (s of store.narrate.scenes(); track s.id) {
              <li class="rounded-lg border border-mc-border bg-mc-bg-elev p-3">
                <div class="mb-2 flex items-center justify-between gap-2 text-sm">
                  <span class="font-medium text-mc-text">{{ s.id }} — panels {{ s.panelIndices.join(', ') }}</span>
                  <span [class]="sceneStatusClass(s.status)">{{ s.status }}</span>
                </div>
                @if (s.status === 'done') {
                  <pre class="m-0 whitespace-pre-wrap font-sans text-sm leading-relaxed text-mc-text">{{ s.narration }}</pre>
                } @else if (s.status === 'failed') {
                  <p class="m-0 flex items-center gap-1.5 text-sm text-mc-danger">
                    <ng-icon name="lucideTriangleAlert" size="0.9rem" />{{ s.error }}
                  </p>
                } @else if (s.status === 'running') {
                  <p class="m-0 text-sm italic text-mc-text-muted">Narrating…</p>
                }
              </li>
            }
          </ul>
        </section>
      }

      @if (store.narrate.error(); as e) {
        <p class="m-0 flex items-center gap-1.5 text-sm text-mc-danger">
          <ng-icon name="lucideTriangleAlert" size="0.9rem" />Narrate: {{ e }}
        </p>
      }

      @if (finalScript(); as script) {
        <section>
          <h3>Final script ({{ finalScriptSource() }})</h3>
          <pre class="m-0 max-h-[36rem] overflow-auto whitespace-pre-wrap rounded-lg border border-mc-border bg-mc-bg-elev p-3 font-sans text-sm leading-relaxed text-mc-text">{{ script }}</pre>
        </section>
      }

      @if (store.polish.error(); as e) {
        <p class="m-0 flex items-center gap-1.5 text-sm text-mc-danger">
          <ng-icon name="lucideTriangleAlert" size="0.9rem" />Polish failed: {{ e }}
        </p>
      }
      @if (store.structural.error(); as e) {
        <p class="m-0 flex items-center gap-1.5 text-sm text-mc-danger">
          <ng-icon name="lucideTriangleAlert" size="0.9rem" />Structural failed: {{ e }}
        </p>
      }

      @if (store.assemble.zipRef(); as zipRef) {
        <section>
          <h3>Download</h3>
          <a
            class="inline-flex items-center gap-2 rounded bg-mc-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            [attr.href]="zipUrl()"
            [attr.download]="store.assemble.suggestedName()"
          >
            <ng-icon name="lucideDownload" size="0.95rem" />
            {{ store.assemble.suggestedName() }}
          </a>
        </section>
      }

      @if (store.assemble.error(); as e) {
        <p class="m-0 flex items-center gap-1.5 text-sm text-mc-danger">
          <ng-icon name="lucideTriangleAlert" size="0.9rem" />Assemble failed: {{ e }}
        </p>
      }

      @if (store.accuracy.status() === 'done' || store.accuracy.status() === 'failed') {
        <section>
          <h3>Accuracy check
            @if (store.accuracy.issues().length === 0 && store.accuracy.status() === 'done') {
              — <span class="text-mc-text-muted">no issues</span>
            } @else if (store.accuracy.issues().length > 0) {
              ({{ store.accuracy.issues().length }} issue{{ store.accuracy.issues().length === 1 ? '' : 's' }})
            }
          </h3>
          @if (store.accuracy.issues().length > 0) {
            <ul class="m-0 flex list-disc flex-col gap-1 pl-5 text-sm text-mc-text">
              @for (issue of store.accuracy.issues(); track issue) {
                <li>{{ issue }}</li>
              }
            </ul>
          }
          @if (store.accuracy.error(); as e) {
            <p class="m-0 mt-2 flex items-center gap-1.5 text-sm text-mc-danger">
              <ng-icon name="lucideTriangleAlert" size="0.9rem" />Accuracy failed: {{ e }}
            </p>
          }
        </section>
      }
    </section>
  `,
  styles: [`
    .page { padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; max-width: 1400px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
    .header h2 { margin: 0; font-size: 1.4rem; }
    .header .hint { margin: 0.25rem 0 0; color: var(--mc-text-muted); font-size: 0.85rem; }
    .reset {
      background: transparent; border: 1px solid var(--mc-border);
      color: var(--mc-text); border-radius: 0.4rem; padding: 0.4rem 0.8rem;
      cursor: pointer; font-size: 0.85rem;
    }
    .reset:hover { background: var(--mc-bg-hover); }
    .file { color: var(--mc-text-muted); margin: 0; }
    .err  { color: var(--mc-danger); margin: 0; font-size: 0.85rem; }
    h3 { margin: 0 0 0.75rem; font-size: 1rem; }
    .bible { background: var(--mc-bg-elev); border: 1px solid var(--mc-border); border-radius: 0.5rem; padding: 1rem; }
    .bible p, .bible ul { margin: 0.25rem 0; }
    .bible li { margin: 0.2rem 0; }
  `],
})
export class SingleModePage {
  protected readonly store = inject(SingleModeStore);
  private readonly blobs = inject(BLOB_REGISTRY_PORT) as BlobRegistryPort;

  protected readonly stages = computed<readonly ProgressStage[]>(() => [
    stage('Extract',    stageStatus(this.store.extract.status()),    this.pagesHint(this.store.extract.pages().length)),
    stage('Filter',     stageStatus(this.store.filter.status()),     this.keptHint()),
    stage('Bible',      stageStatus(this.store.bible.status()),      this.bibleHint()),
    stage('Narrate',    stageStatus(this.store.narrate.status()),    this.narrateHint()),
    stage('Polish',     stageStatus(this.store.polish.status()),     undefined),
    stage('Structural', stageStatus(this.store.structural.status()), undefined),
    stage('Accuracy',   stageStatus(this.store.accuracy.status()),   this.accuracyHint()),
    stage('Assemble',   stageStatus(this.store.assemble.status()),   undefined),
  ]);

  protected readonly finalScript = computed<string | null>(() => {
    return this.store.structural.value() ?? this.store.polish.value();
  });

  protected readonly finalScriptSource = computed<string>(() => {
    if (this.store.structural.value()) return 'polish + structural';
    if (this.store.polish.value()) return 'polish';
    return '';
  });

  protected readonly zipUrl = computed<string | null>(() => {
    const ref = this.store.assemble.zipRef();
    return ref ? this.blobs.url(ref) : null;
  });

  protected readonly extractedItems = computed<readonly ImageGridItem[]>(() =>
    this.store.extract.pages().map((p) => ({
      id: p.bytesRef,
      url: this.blobs.url(p.bytesRef) ?? '',
      caption: `Page ${p.index}`,
    })),
  );

  protected readonly filteredItems = computed<readonly ImageGridItem[]>(() =>
    this.store.filter.pages().map((p: FilteredPage) => ({
      id: p.bytesRef,
      url: this.blobs.url(p.bytesRef) ?? '',
      caption: `Page ${p.index} — ${p.reason}`,
      dimmed: !p.kept,
    })),
  );

  protected readonly keptCount = computed(() => this.store.filter.pages().filter((p) => p.kept).length);
  protected readonly doneSceneCount = computed(() => this.store.narrate.scenes().filter((s) => s.status === 'done').length);

  protected sceneStatusClass(status: SceneRow['status']): string {
    switch (status) {
      case 'done':    return 'rounded px-2 py-0.5 text-xs bg-mc-bg text-mc-text-muted';
      case 'running': return 'rounded px-2 py-0.5 text-xs bg-mc-accent text-white';
      case 'failed':  return 'rounded px-2 py-0.5 text-xs bg-mc-danger text-white';
      default:        return 'rounded px-2 py-0.5 text-xs bg-mc-bg text-mc-text-faint';
    }
  }

  onFiles(files: readonly File[]): void {
    const first = files[0];
    if (first) void this.store.run(first);
  }

  private pagesHint(n: number): string | undefined {
    return n > 0 ? `${n} pages` : undefined;
  }
  private keptHint(): string | undefined {
    const pages = this.store.filter.pages();
    if (!pages.length) return undefined;
    const kept = pages.filter((p) => p.kept).length;
    return `${kept} kept / ${pages.length} total`;
  }
  private bibleHint(): string | undefined {
    const b = this.store.bible.value();
    return b ? `${b.characters.length} characters` : undefined;
  }
  private narrateHint(): string | undefined {
    const scenes = this.store.narrate.scenes();
    if (!scenes.length) return undefined;
    const done = scenes.filter((s) => s.status === 'done').length;
    return `${done} / ${scenes.length} scenes`;
  }
  private accuracyHint(): string | undefined {
    if (this.store.accuracy.status() === 'done') {
      const n = this.store.accuracy.issues().length;
      return n === 0 ? 'clean' : `${n} issue${n === 1 ? '' : 's'}`;
    }
    return undefined;
  }
}
