import { stableStringify, ok, err, novaError } from '@novaos/shared';
import type { Result } from '@novaos/shared';
import type { DomainEvent } from './domain-event';

/** Serialize an event trace to a stable, diffable JSON string. */
export function serializeEvents(events: readonly DomainEvent[]): string {
  return stableStringify(events);
}

/**
 * Parse and validate an imported event trace. Imported traces are untrusted, so
 * the shape of every entry is checked before it is accepted.
 */
export function deserializeEvents(json: string): Result<DomainEvent[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return err(
      novaError({
        code: 'events/invalid-json',
        severity: 'recoverable',
        message: 'The trace could not be parsed as JSON.',
      }),
    );
  }

  if (!Array.isArray(parsed)) {
    return err(
      novaError({
        code: 'events/invalid-trace',
        severity: 'recoverable',
        message: 'A trace must be an array of events.',
      }),
    );
  }

  for (const candidate of parsed) {
    if (!isDomainEventShape(candidate)) {
      return err(
        novaError({
          code: 'events/invalid-event',
          severity: 'recoverable',
          message: 'The trace contains an entry that is not a valid event.',
        }),
      );
    }
  }

  return ok(parsed as DomainEvent[]);
}

export function isDomainEventShape(value: unknown): value is DomainEvent {
  if (value === null || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  return (
    typeof event.id === 'string' &&
    typeof event.type === 'string' &&
    typeof event.sequence === 'number' &&
    typeof event.tick === 'number' &&
    typeof event.source === 'string' &&
    'payload' in event
  );
}
