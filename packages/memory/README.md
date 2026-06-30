# @novaos/memory

## Purpose

The byte-addressable memory core. In Milestone 1 it is a flat, little-endian RAM
with bounds-checked byte/word access — enough to hold program code that the CPU
fetches. Memory segments, the first-fit allocator, stack/heap helpers, permission
checks, and read/write events arrive in Milestone 2.

## Public API

- **`createMemory(sizeBytes?)` → `Memory`** — `readByte`, `writeByte`, `readWord`,
  `writeWord` (little-endian), `load`, `snapshot`, `restore`, `size`.
- **`DEFAULT_RAM_BYTES`** (64 KiB), **`MemorySnapshot`**.

All access is bounds-checked and returns a `Result`; out-of-bounds access yields a
`memory/out-of-bounds` diagnostic rather than throwing.

## Events

None yet — event emission lands with the segmented memory model in Milestone 2.

## Snapshots

`MemorySnapshot` (`{ sizeBytes, data }`) — serializable and restorable; restore
rejects a size mismatch.

## Testing

Unit tests cover byte/word round-trips, little-endian ordering, out-of-bounds
faults, buffer loading, and snapshot/restore (including size-mismatch rejection).

## Dependency Rules

Depends on `@novaos/shared` only. No UI, no scheduling/kernel policy, deterministic.
