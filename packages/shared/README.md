# @novaos/shared

## Purpose

The zero-dependency primitives layer that every other NovaOS package builds on:
branded machine types, the `Result` type, source spans, the diagnostic and error
models, deterministic time and randomness, ordering helpers, and serialization
wrappers.

## Public API

- **Branding:** `Brand<T, B>`
- **Machine types:** `Address`, `Byte`, `Word`, `SimTime` with `as*` casts and validating
  `createByte` / `createWord` / `createAddress`
- **Identifiers:** `EventId`, `CorrelationId`, `CausationId`, `ProcessId`, `SequenceNumber`
- **Result:** `Result<T, E>`, `ok`, `err`, `isOk`, `isErr`, `unwrap`, `unwrapOr`, `map`, `mapErr`
- **Errors:** `NovaError`, `Severity`, `novaError`, `isNovaError`
- **Source:** `SourcePosition`, `SourceSpan`, `SourceLocation`, `FileId`, `span`, `position`
- **Diagnostics:** `Diagnostic`, `DiagnosticSeverity`, `diagnostic`, `hasErrors`, `countBySeverity`
- **Determinism:** `SimulationClock` / `createSimulationClock`, `DeterministicRandom` / `createSeededRandom`
- **Ordering:** `stableSort`, `sortedKeys`, `sortedEntries`, `compareNumbers`, `compareStrings`
- **Serialization:** `Versioned`, `PersistedDocument`, `versioned`, `stableStringify`

## Events

None — `@novaos/shared` defines primitives, not domain behavior.

## Snapshots

Provides the serialization primitives (`Versioned`, `stableStringify`) that other
packages use to build their snapshots.

## Testing

Unit tests cover `Result`, value constructors, the clock, the seeded PRNG
(including determinism and snapshot/restore), `stableStringify`, and diagnostics.

## Dependency Rules

Depends on **nothing**. May not import any other workspace package. Must remain
deterministic (no `Date.now()` / `Math.random()`).
