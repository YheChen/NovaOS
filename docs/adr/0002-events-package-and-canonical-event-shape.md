# ADR-0002: Dedicated events package and canonical event shape

## Status

Accepted (Milestone 0)

## Context

The specifications describe the event system in two slightly different places:

- `02-system-architecture.md` §6 lists `packages/events` as its own package, and §10.1
  describes a `DomainEvent` with a `timestamp: SimTime` field plus `causationId`.
- `08-agent-orchestration-v2.md` (Agent 07) places the event bus at
  `packages/shared/src/events`, and §16 defines the cross-agent `NovaEvent` integration
  contract with a `tick: number` field (no `timestamp`).

These must be reconciled into a single canonical contract before any domain package
emits events, because every package and the UI depend on the event shape.

## Decision

1. **`@novaos/events` is its own package** that depends only on `@novaos/shared`.
   This keeps `@novaos/shared` a zero-dependency primitives package and gives the event
   system room to grow (serialization, recorder, replay helpers) without bloating shared.

2. **Canonical `DomainEvent` shape** unifies both spec variants:

   ```ts
   interface DomainEvent<TType extends string = string, TPayload = unknown> {
     id: EventId;
     type: TType;
     sequence: SequenceNumber; // monotonic, assigned by the bus on publish
     tick: SimTime; // simulated time (branded number) - reconciles `tick`/`timestamp`
     source: EventSource;
     correlationId?: CorrelationId;
     causationId?: CausationId;
     payload: TPayload;
   }
   ```

   `tick` is a branded `SimTime` (a number), satisfying both the orchestration contract
   (`tick`) and the architecture doc's intent (simulated time), while keeping `causationId`
   from the architecture doc.

3. **The bus assigns `id` and `sequence`.** Emitters publish an `EventInput` (the event
   without `id`/`sequence`); the bus stamps a monotonic `sequence` and a deterministic
   `id` (`evt-<sequence>`). This guarantees deterministic, replayable identifiers.

## Consequences

- One event contract for the whole system; the UI and timeline consume it directly.
- Deterministic ids/sequence make golden and replay tests stable.
- Domain packages depend on `@novaos/events` (and `@novaos/shared`) rather than importing
  event types from `shared`.

## Alternatives Considered

- **Event bus inside `@novaos/shared`** (per orchestration doc): simpler import graph but
  couples primitives to the evolving event model and violates the "shared stays minimal"
  goal.
- **Keeping both `timestamp` and `tick`**: redundant and a determinism hazard; rejected.
