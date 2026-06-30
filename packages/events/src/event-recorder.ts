import type { DomainEvent } from './domain-event';
import type { EventBus } from './event-bus';
import { allEvents } from './matchers';

/**
 * Captures an ordered, append-only history of every published event. This is
 * the backbone of the timeline and deterministic replay: unlike the bus's
 * transient `drain` buffer, the recorder keeps the full trace until cleared.
 */
export interface EventRecorder {
  /** Subscribe to a bus and record everything it publishes. */
  attach(bus: EventBus): void;
  detach(): void;
  /** Record an event directly (e.g. when replaying a saved trace). */
  record(event: DomainEvent): void;
  getEvents(): readonly DomainEvent[];
  getEventsByType(type: string): DomainEvent[];
  count(): number;
  clear(): void;
}

export function createEventRecorder(): EventRecorder {
  const events: DomainEvent[] = [];
  let unsubscribe: (() => void) | null = null;

  const recorder: EventRecorder = {
    attach(bus: EventBus): void {
      recorder.detach();
      unsubscribe = bus.subscribe(allEvents, (event) => {
        events.push(event);
      });
    },
    detach(): void {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    },
    record(event: DomainEvent): void {
      events.push(event);
    },
    getEvents: () => events,
    getEventsByType: (type: string) => events.filter((event) => event.type === type),
    count: () => events.length,
    clear(): void {
      events.length = 0;
    },
  };

  return recorder;
}
