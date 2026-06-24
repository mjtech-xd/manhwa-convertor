import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface ImageGridItem {
  readonly id: string;
  readonly url: string;
  readonly caption?: string;
  readonly dimmed?: boolean;
}

@Component({
  selector: 'mc-image-grid',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (items().length === 0) {
      <p class="empty">No images yet.</p>
    } @else {
      <ul class="grid">
        @for (item of items(); track item.id) {
          <li class="cell" [class.is-dimmed]="item.dimmed">
            <img [src]="item.url" loading="lazy" alt="" />
            @if (item.caption) { <span class="caption">{{ item.caption }}</span> }
          </li>
        }
      </ul>
    }
  `,
  // `content-visibility: auto` lets the renderer skip layout + paint for
  // off-screen cells, so a chapter with hundreds of panels stays smooth
  // without DOM virtualisation (no CDK, no fixed-height cropping). The
  // intrinsic-size hint keeps the scrollbar stable before a cell renders.
  // Electron is Chromium, so this is always available.
  styles: [`
    .empty { color: var(--mc-text-muted); }
    .grid {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 0.75rem;
    }
    .cell {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      background: var(--mc-bg-elev);
      border: 1px solid var(--mc-border);
      border-radius: 0.4rem;
      overflow: hidden;
      transition: opacity 120ms ease;
      content-visibility: auto;
      contain-intrinsic-size: auto 220px;
    }
    .cell.is-dimmed { opacity: 0.35; }
    img { width: 100%; height: auto; display: block; }
    .caption {
      font-size: 0.7rem;
      color: var(--mc-text-muted);
      padding: 0.3rem 0.4rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `],
})
export class ImageGridComponent {
  readonly items = input.required<readonly ImageGridItem[]>();
}
