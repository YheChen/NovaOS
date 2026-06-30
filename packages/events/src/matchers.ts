import type { DomainEvent, EventMatcher, EventSource } from './domain-event';

/** Matches every event. */
export const allEvents: EventMatcher = () => true;

/** Matches events of an exact type. */
export const ofType =
  (type: string): EventMatcher =>
  (event: DomainEvent) =>
    event.type === type;

/** Matches events whose type begins with a prefix (e.g. `cpu.`). */
export const ofTypePrefix =
  (prefix: string): EventMatcher =>
  (event: DomainEvent) =>
    event.type.startsWith(prefix);

/** Matches events from a given source package. */
export const ofSource =
  (source: EventSource): EventMatcher =>
  (event: DomainEvent) =>
    event.source === source;

/** Combines matchers with logical OR. */
export const anyOf =
  (...matchers: EventMatcher[]): EventMatcher =>
  (event: DomainEvent) =>
    matchers.some((match) => match(event));
