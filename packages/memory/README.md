# @novaos/memory

## Purpose

The byte-addressable memory core plus the segment allocator. Provides a flat,
little-endian, bounds-checked RAM (the CPU fetches instructions through it) and a
first-fit allocator that carves per-process `code`/`data`/`heap`/`stack` segments
out of RAM with ownership tracking and a memory-map view.

## Public API

- **`createMemory(sizeBytes?)` → `Memory`** — `readByte`/`writeByte`/`readWord`/`writeWord`
  (little-endian, bounds-checked), `load`, `snapshot`/`restore`, `size`.
- **Allocator:** `reserve(request)` (first-fit), `release(id)` (frees + coalesces adjacent
  free blocks), `getSegment(address)`, `listSegments()`, `memoryMap()`.
- **Types:** `MemorySegment`, `MemorySegmentKind`, `MemoryPermissions`, `SegmentId`,
  `ReserveRequest`, `MemoryMapSnapshot`, `FragmentationSummary`, `defaultPermissions`.

## Events

None yet — memory read/write/allocation events and permission-enforced access land in a
later milestone. M2 tracks segment ownership and exposes the memory map.

## Snapshots

`MemorySnapshot` (`{ sizeBytes, data }`, bytes only for now) and `MemoryMapSnapshot`
(`totalBytes`/`usedBytes`/`freeBytes`/`segments`/`fragmentation`). Segment serialization
into the byte snapshot is deferred until replay needs it.

## Testing

Unit tests cover byte/word round-trips, little-endian ordering, out-of-bounds faults,
load, snapshot/restore, and the allocator (first-fit placement, permissions per kind,
out-of-memory, release + free-block coalescing, address→segment lookup, memory-map
accounting).

## Dependency Rules

Depends on `@novaos/shared` only. No UI, no scheduling/kernel policy, deterministic.
