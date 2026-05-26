import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type ProgressStageStatus = 'pending' | 'running' | 'done' | 'failed';

export interface ProgressStage {
  readonly label: string;
  readonly status: ProgressStageStatus;
  readonly hint?: string;
}

@Component({
  selector: 'mc-progress-rail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="rail">
      @for (stage of stages(); track stage.label) {
        <li class="stage" [attr.data-status]="stage.status">
          <span class="dot"></span>
          <span class="label">{{ stage.label }}</span>
          @if (stage.hint) { <span class="hint">{{ stage.hint }}</span> }
        </li>
      }
    </ol>
  `,
  styles: [`
    .rail {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    .stage {
      display: grid;
      grid-template-columns: 1rem auto 1fr;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.85rem;
      color: var(--mc-text-muted);
    }
    .stage[data-status="running"] { color: var(--mc-text); }
    .stage[data-status="done"]    { color: var(--mc-success); }
    .stage[data-status="failed"]  { color: var(--mc-danger); }
    .dot {
      width: 0.65rem;
      height: 0.65rem;
      border-radius: 50%;
      background: var(--mc-border);
    }
    .stage[data-status="running"] .dot { background: var(--mc-accent); animation: pulse 1.2s ease-in-out infinite; }
    .stage[data-status="done"]    .dot { background: var(--mc-success); }
    .stage[data-status="failed"]  .dot { background: var(--mc-danger); }
    .hint { color: var(--mc-text-faint); font-size: 0.75rem; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  `],
})
export class ProgressRailComponent {
  readonly stages = input.required<readonly ProgressStage[]>();
}
