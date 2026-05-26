import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'mc-bulk-mode-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mode-page">
      <h2>Bulk mode</h2>
      <p class="hint">Queue 5–15 chapters with master-bible threading and checkpoint resume.</p>
      <p class="todo">Implementation pending — phase 4 of the migration roadmap.</p>
    </section>
  `,
  styles: [`
    .mode-page { padding: 2rem; display: flex; flex-direction: column; gap: 0.75rem; }
    h2 { margin: 0; font-size: 1.5rem; }
    .hint { color: var(--mc-text-muted); margin: 0; }
    .todo { color: var(--mc-text-faint); font-style: italic; margin: 0; }
  `],
})
export class BulkModePage {}
