import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import { ChapterId, EVENT_BUS_PORT, type EventBusPort, type StageEvent } from '@mc/domain';
import { StageTimingService, percentile } from './stage-timing.service';

class FakeBus implements EventBusPort {
  private handler: ((e: StageEvent) => void) | undefined;
  emit(e: StageEvent): void {
    this.handler?.(e);
  }
  onStage(handler: (e: StageEvent) => void): () => void {
    this.handler = handler;
    return () => (this.handler = undefined);
  }
}

function ev(
  stage: StageEvent['stage'],
  phase: StageEvent['phase'],
  tsMs: number,
  run = 'r1',
): StageEvent {
  return { stage, phase, chapterId: ChapterId(run), tsMs };
}

describe('percentile', () => {
  it('returns 0 for empty and the single value for one sample', () => {
    expect(percentile([], 95)).toBe(0);
    expect(percentile([42], 95)).toBe(42);
  });

  it('uses nearest-rank', () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(data, 50)).toBe(5);
    expect(percentile(data, 95)).toBe(10);
    expect(percentile(data, 100)).toBe(10);
  });
});

describe('StageTimingService', () => {
  let bus: FakeBus;
  let svc: StageTimingService;

  beforeEach(() => {
    bus = new FakeBus();
    TestBed.configureTestingModule({
      providers: [{ provide: EVENT_BUS_PORT, useValue: bus }, StageTimingService],
    });
    svc = TestBed.inject(StageTimingService);
  });

  it('records a stage duration from a paired start/end', () => {
    bus.emit(ev('narrate', 'start', 1000));
    bus.emit(ev('narrate', 'end', 4000));

    expect(svc.summary()).toEqual([
      { stage: 'narrate', count: 1, p50Ms: 3000, p95Ms: 3000, lastMs: 3000 },
    ]);
  });

  it('aggregates p50/p95 across multiple runs of a stage', () => {
    // Durations 100,200,...,1000ms across distinct runs.
    for (let i = 1; i <= 10; i++) {
      const run = `r${i}`;
      bus.emit(ev('filter', 'start', 0, run));
      bus.emit(ev('filter', 'end', i * 100, run));
    }
    const filter = svc.summary().find((s) => s.stage === 'filter');
    expect(filter?.count).toBe(10);
    expect(filter?.p50Ms).toBe(500);
    expect(filter?.p95Ms).toBe(1000);
    expect(filter?.lastMs).toBe(1000);
  });

  it('ignores an end with no matching start', () => {
    bus.emit(ev('polish', 'end', 5000));
    expect(svc.summary()).toEqual([]);
  });

  it('does not record a stage that errored', () => {
    bus.emit(ev('bible', 'start', 1000));
    bus.emit(ev('bible', 'error', 2000));
    bus.emit(ev('bible', 'end', 3000)); // pending already cleared by error
    expect(svc.summary()).toEqual([]);
  });

  it('reset() clears all samples', () => {
    bus.emit(ev('extract', 'start', 0));
    bus.emit(ev('extract', 'end', 500));
    expect(svc.summary()).toHaveLength(1);
    svc.reset();
    expect(svc.summary()).toEqual([]);
  });
});
