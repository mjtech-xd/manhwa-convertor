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
import { SingleModeStore, type StageStatus } from './single-mode.store';

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
          <p class="hint">Drop a chapter PDF. Pipeline runs extract → filter → bible.</p>
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
    stage('Extract', stageStatus(this.store.extract.status()), this.pagesHint(this.store.extract.pages().length)),
    stage('Filter',  stageStatus(this.store.filter.status()),  this.keptHint()),
    stage('Bible',   stageStatus(this.store.bible.status()),   this.bibleHint()),
  ]);

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
}
