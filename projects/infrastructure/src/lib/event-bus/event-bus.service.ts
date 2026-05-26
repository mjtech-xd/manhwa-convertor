// In-process event bus for cross-cutting concerns (stage progress, key
// rotator updates). Anything that genuinely needs to fan out to multiple
// consumers without a direct DI relationship.

import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import type { EventBusPort, StageEvent } from 'domain';

@Injectable({ providedIn: 'root' })
export class EventBusService implements EventBusPort {
  private readonly subject = new Subject<StageEvent>();

  emit(event: StageEvent): void {
    this.subject.next(event);
  }

  onStage(handler: (event: StageEvent) => void): () => void {
    const sub = this.subject.subscribe(handler);
    return () => sub.unsubscribe();
  }
}
