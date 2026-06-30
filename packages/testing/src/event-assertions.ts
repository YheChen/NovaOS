import type { DomainEvent } from '@novaos/events';

/** Extract the ordered list of event types from a trace. */
export function eventTypes(events: readonly DomainEvent[]): string[] {
  return events.map((event) => event.type);
}

/** Throw a readable error unless the trace's event types match `expected` exactly. */
export function assertEventSequence(
  events: readonly DomainEvent[],
  expected: readonly string[],
): void {
  const actual = eventTypes(events);
  const matches =
    actual.length === expected.length && expected.every((type, index) => actual[index] === type);
  if (!matches) {
    throw new Error(
      `Event sequence mismatch.\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`,
    );
  }
}

export interface EventSequenceAssertion {
  toEqualSequence(expected: readonly string[]): void;
}

/**
 * Ergonomic helper used throughout the test suites:
 *
 * ```ts
 * expectEvents(recorder.getEvents()).toEqualSequence([
 *   'kernel.boot.started',
 *   'kernel.boot.completed',
 * ]);
 * ```
 */
export function expectEvents(events: readonly DomainEvent[]): EventSequenceAssertion {
  return {
    toEqualSequence: (expected) => assertEventSequence(events, expected),
  };
}
