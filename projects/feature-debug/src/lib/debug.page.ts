import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'mc-debug-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mode-page">
      <h2>Debug</h2>
      <p class="hint">Stage timing, IPC log, key-rotator state.</p>
      <p class="todo">Wired with the EventBus port — phase 3.</p>
    </section>
  `,
  styles: [`
    .mode-page { padding: 2rem; display: flex; flex-direction: column; gap: 0.75rem; }
    h2 { margin: 0; font-size: 1.5rem; }
    .hint { color: var(--mc-text-muted); margin: 0; }
    .todo { color: var(--mc-text-faint); font-style: italic; margin: 0; }
  `],
})
export class DebugPage {}
