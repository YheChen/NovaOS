import { asSequence, eventId } from '@novaos/shared';
import type {
  DomainEvent,
  EventInput,
  EventListener,
  EventMatcher,
  Unsubscribe,
} from './domain-event';

/**
 * The typed event bus. Producers `publish` an `EventInput`; the bus assigns a
 * monotonic `sequence` and a deterministic `id`, routes the event to matching
 * subscribers, and buffers it for batched consumers via `drain`.
 */
export interface EventBus {
  publish<TType extends string, TPayload>(
    input: EventInput<TType, TPayload>,
  ): DomainEvent<TType, TPayload>;
  subscribe<T extends DomainEvent = DomainEvent>(
    matcher: EventMatcher,
    listener: EventListener<T>,
  ): Unsubscribe;
  /** Return and clear the pending event buffer (for batched UI consumption). */
  drain(): DomainEvent[];
  reset(): void;
}

interface Subscription {
  readonly matcher: EventMatcher;
  readonly listener: EventListener;
}

export function createEventBus(): EventBus {
  let sequence = 0;
  let buffer: DomainEvent[] = [];
  const subscriptions = new Set<Subscription>();

  function publish<TType extends string, TPayload>(
    input: EventInput<TType, TPayload>,
  ): DomainEvent<TType, TPayload> {
    const seq = asSequence(sequence);
    sequence += 1;
    const event: DomainEvent<TType, TPayload> = {
      ...input,
      id: eventId(`evt-${seq}`),
      sequence: seq,
    };
    buffer.push(event as DomainEvent);
    for (const subscription of subscriptions) {
      if (subscription.matcher(event as DomainEvent)) {
        subscription.listener(event as DomainEvent);
      }
    }
    return event;
  }

  function subscribe<T extends DomainEvent = DomainEvent>(
    matcher: EventMatcher,
    listener: EventListener<T>,
  ): Unsubscribe {
    const subscription: Subscription = { matcher, listener: listener as EventListener };
    subscriptions.add(subscription);
    return () => {
      subscriptions.delete(subscription);
    };
  }

  function drain(): DomainEvent[] {
    const drained = buffer;
    buffer = [];
    return drained;
  }

  function reset(): void {
    sequence = 0;
    buffer = [];
    subscriptions.clear();
  }

  return { publish, subscribe, drain, reset };
}
