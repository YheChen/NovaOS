# @novaos/testing

## Purpose

Shared test utilities so every package can assert on events and determinism the
same way. Consumed as a `devDependency` by other packages' test suites.

## Public API

- **`createTestEventBus()`** → `{ bus, recorder }` - an `EventBus` with an attached
  `EventRecorder`.
- **`expectEvents(events).toEqualSequence([...])`** - assert an exact event-type sequence.
- **`assertEventSequence`**, **`eventTypes`** - lower-level helpers.
- **`seeded(seed)`** - a deterministic RNG (re-export of `createSeededRandom`).

## Events

None - provides tooling for asserting on events emitted elsewhere.

## Snapshots

None.

## Testing

Self-tested: the harness and assertion helpers have their own unit tests.

## Dependency Rules

Depends on `@novaos/events` and `@novaos/shared`. Must remain UI-free. Other
packages depend on it only via `devDependencies` (never at runtime).
