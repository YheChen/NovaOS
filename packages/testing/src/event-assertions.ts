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

/**
 * Throw unless every type in `expected` appears in the trace in the given order
 * (other events may appear in between). Useful for asserting key lifecycle order
 * without pinning down every event.
 */
export function assertEventSubsequence(
  events: readonly DomainEvent[],
  expected: readonly string[],
): void {
  const actual = eventTypes(events);
  let cursor = 0;
  for (const type of actual) {
    if (cursor < expected.length && type === expected[cursor]) cursor += 1;
  }
  if (cursor !== expected.length) {
    throw new Error(
      `Event subsequence not found (matched ${cursor}/${expected.length}).\n  expected order: ${JSON.stringify(expected)}\n  actual:         ${JSON.stringify(actual)}`,
    );
  }
}

export interface EventSequenceAssertion {
  toEqualSequence(expected: readonly string[]): void;
  toContainSequence(expected: readonly string[]): void;
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
    toContainSequence: (expected) => assertEventSubsequence(events, expected),
  };
}
