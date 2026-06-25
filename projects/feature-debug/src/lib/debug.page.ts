import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { STAGE_TIMING_PORT } from '@mc/domain';

@Component({
  selector: 'mc-debug-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mode-page">
      <h2>Debug</h2>
      <p class="hint">Per-stage timing (p50 / p95) across this session's runs.</p>

      @if (rows().length === 0) {
        <p class="todo">No timings yet — run a chapter to populate.</p>
      } @else {
        <table class="timing">
          <thead>
            <tr>
              <th>Stage</th>
              <th class="num">Runs</th>
              <th class="num">p50</th>
              <th class="num">p95</th>
              <th class="num">Last</th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.stage) {
              <tr [class.slow]="r.p95Ms > p95BudgetMs">
                <td>{{ r.stage }}</td>
                <td class="num">{{ r.count }}</td>
                <td class="num">{{ fmt(r.p50Ms) }}</td>
                <td class="num">{{ fmt(r.p95Ms) }}</td>
                <td class="num">{{ fmt(r.lastMs) }}</td>
              </tr>
            }
          </tbody>
        </table>
        <p class="hint">
          Chapter p95 (sum of stage p95s): <strong>{{ fmt(chapterP95Ms()) }}</strong> /
          {{ fmt(chapterBudgetMs) }} budget.
        </p>
      }
    </section>
  `,
  styles: [
    `
      .mode-page {
        padding: 2rem;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      h2 {
        margin: 0;
        font-size: 1.5rem;
      }
      .hint {
        color: var(--mc-text-muted);
        margin: 0;
      }
      .todo {
        color: var(--mc-text-faint);
        font-style: italic;
        margin: 0;
      }
      table.timing {
        border-collapse: collapse;
        font-variant-numeric: tabular-nums;
        max-width: 32rem;
      }
      th,
      td {
        padding: 0.35rem 0.9rem;
        text-align: left;
        border-bottom: 1px solid var(--mc-border);
      }
      .num {
        text-align: right;
      }
      tr.slow td {
        color: var(--mc-danger, #e5484d);
      }
    `,
  ],
})
export class DebugPage {
  private readonly timing = inject(STAGE_TIMING_PORT);

  protected readonly rows = this.timing.summary;
  // Chapter target is <60s (CLAUDE.md §11/§12); flag any stage whose p95
  // alone eats a third of the budget.
  protected readonly chapterBudgetMs = 60_000;
  protected readonly p95BudgetMs = 20_000;

  protected readonly chapterP95Ms = computed(() =>
    this.rows().reduce((sum, r) => sum + r.p95Ms, 0),
  );

  protected fmt(ms: number): string {
    return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
  }
}
