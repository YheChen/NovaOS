# @novaos/events

## Purpose

The typed event system that connects the simulator core to the UI, timeline,
tests, and replay engine. Every meaningful state transition in NovaOS is
published here as a serializable `DomainEvent`.

## Public API

- **`DomainEvent<TType, TPayload>`** — the canonical event shape (`id`, `type`,
  `sequence`, `tick`, `source`, optional `correlationId`/`causationId`, `payload`).
  See [ADR-0002](../../docs/adr/0002-events-package-and-canonical-event-shape.md).
- **`EventInput`**, **`EventSource`**, **`EventListener`**, **`EventMatcher`**, **`Unsubscribe`**
- **`EventBus` / `createEventBus()`** — `publish` (assigns `id` + `sequence`), `subscribe`,
  `drain`, `reset`.
- **`EventRecorder` / `createEventRecorder()`** — ordered append-only trace for the timeline.
- **Matchers:** `allEvents`, `ofType`, `ofTypePrefix`, `ofSource`, `anyOf`.
- **Serialization:** `serializeEvents`, `deserializeEvents` (validates untrusted traces),
  `isDomainEventShape`.

## Events

Defines the event contract itself; concrete event types are contributed by each
domain package in later milestones.

## Snapshots

The recorded event trace (`serializeEvents` output) is the foundation of timeline
export and deterministic replay.

## Testing

Unit tests cover deterministic id/sequence assignment, matcher-based routing,
unsubscribe, `drain` semantics, recorder ordering, two-run determinism, and trace
serialization round-trips and validation failures.

## Dependency Rules

Depends only on `@novaos/shared`. Must remain UI-free and deterministic.
