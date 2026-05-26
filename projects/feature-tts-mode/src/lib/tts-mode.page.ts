import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'mc-tts-mode-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mode-page">
      <h2>TTS mode</h2>
      <p class="hint">Render a script to MP3 + frame-accurate SRT via ai33.pro.</p>
      <p class="todo">Implementation pending — phase 5 of the migration roadmap.</p>
    </section>
  `,
  styles: [`
    .mode-page { padding: 2rem; display: flex; flex-direction: column; gap: 0.75rem; }
    h2 { margin: 0; font-size: 1.5rem; }
    .hint { color: var(--mc-text-muted); margin: 0; }
    .todo { color: var(--mc-text-faint); font-style: italic; margin: 0; }
  `],
})
export class TtsModePage {}
