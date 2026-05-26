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
