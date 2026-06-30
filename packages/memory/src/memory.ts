import { ok, err, novaError, asByte } from '@novaos/shared';
import type { Result, Address, Byte } from '@novaos/shared';
import {
  segmentId,
  defaultPermissions,
  type MemorySegment,
  type MemoryMapSnapshot,
  type ReserveRequest,
  type SegmentId,
} from './segments';

/**
 * The memory core: a flat, byte-addressable, little-endian RAM with
 * bounds-checked access plus a first-fit segment allocator. The CPU fetches
 * instructions through the byte/word accessors; the kernel reserves per-process
 * code/data/heap/stack segments through the allocator.
 *
 * Permission-enforced access (faulting on writing to code, etc.) and memory
 * read/write events are deferred to a later milestone; M2 tracks segment
 * ownership and exposes a memory map.
 */
export const DEFAULT_RAM_BYTES = 65536;

export interface MemorySnapshot {
  readonly sizeBytes: number;
  readonly data: number[];
}

interface FreeBlock {
  base: number;
  size: number;
}

export interface Memory {
  readonly size: number;
  readByte(address: Address): Result<Byte>;
  writeByte(address: Address, value: number): Result<void>;
  readWord(address: Address): Result<number>;
  writeWord(address: Address, value: number): Result<void>;
  load(address: Address, bytes: Uint8Array): Result<void>;
  reserve(request: ReserveRequest): Result<MemorySegment>;
  release(id: SegmentId): Result<void>;
  getSegment(address: Address): MemorySegment | null;
  listSegments(): MemorySegment[];
  memoryMap(): MemoryMapSnapshot;
  snapshot(): MemorySnapshot;
  restore(snapshot: MemorySnapshot): Result<void>;
}

export function createMemory(sizeBytes: number = DEFAULT_RAM_BYTES): Memory {
  const data = new Uint8Array(sizeBytes);
  const segments = new Map<SegmentId, MemorySegment>();
  let freeBlocks: FreeBlock[] = [{ base: 0, size: sizeBytes }];
  let nextSegment = 1;

  const inBounds = (address: number, length: number): boolean =>
    Number.isInteger(address) && address >= 0 && address + length <= sizeBytes;

  const outOfBounds = (address: number, length: number) =>
    err(
      novaError({
        code: 'memory/out-of-bounds',
        severity: 'recoverable',
        message: `Access at 0x${address.toString(16)} (length ${length}) is outside RAM (0x0-0x${(sizeBytes - 1).toString(16)}).`,
      }),
    );

  function coalesce(): void {
    freeBlocks.sort((a, b) => a.base - b.base);
    const merged: FreeBlock[] = [];
    for (const block of freeBlocks) {
      const last = merged[merged.length - 1];
      if (last && last.base + last.size === block.base) {
        last.size += block.size;
      } else {
        merged.push({ ...block });
      }
    }
    freeBlocks = merged;
  }

  return {
    size: sizeBytes,

    readByte(address) {
      if (!inBounds(address, 1)) return outOfBounds(address, 1);
      return ok(asByte(data[address] ?? 0));
    },

    writeByte(address, value) {
      if (!inBounds(address, 1)) return outOfBounds(address, 1);
      data[address] = value & 0xff;
      return ok(undefined);
    },

    readWord(address) {
      if (!inBounds(address, 4)) return outOfBounds(address, 4);
      const b0 = data[address] ?? 0;
      const b1 = data[address + 1] ?? 0;
      const b2 = data[address + 2] ?? 0;
      const b3 = data[address + 3] ?? 0;
      return ok((b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0);
    },

    writeWord(address, value) {
      if (!inBounds(address, 4)) return outOfBounds(address, 4);
      const word = value >>> 0;
      data[address] = word & 0xff;
      data[address + 1] = (word >>> 8) & 0xff;
      data[address + 2] = (word >>> 16) & 0xff;
      data[address + 3] = (word >>> 24) & 0xff;
      return ok(undefined);
    },

    load(address, bytes) {
      if (!inBounds(address, bytes.length)) return outOfBounds(address, bytes.length);
      data.set(bytes, address);
      return ok(undefined);
    },

    reserve(request) {
      if (!Number.isInteger(request.size) || request.size <= 0) {
        return err(
          novaError({
            code: 'memory/invalid-size',
            severity: 'recoverable',
            message: `Cannot reserve a segment of size ${request.size}.`,
          }),
        );
      }
      const index = freeBlocks.findIndex((block) => block.size >= request.size);
      const block = index >= 0 ? freeBlocks[index] : undefined;
      if (!block) {
        return err(
          novaError({
            code: 'memory/out-of-memory',
            severity: 'recoverable',
            message: `No free block large enough to reserve ${request.size} bytes for ${request.kind}.`,
          }),
        );
      }
      const base = block.base;
      const remaining = block.size - request.size;
      if (remaining === 0) {
        freeBlocks.splice(index, 1);
      } else {
        block.base = base + request.size;
        block.size = remaining;
      }
      const id = segmentId(`seg-${nextSegment}`);
      nextSegment += 1;
      const segment: MemorySegment = {
        id,
        ownerPid: request.ownerPid,
        kind: request.kind,
        base,
        size: request.size,
        permissions: request.permissions ?? defaultPermissions(request.kind),
        label: request.label ?? request.kind,
      };
      segments.set(id, segment);
      return ok(segment);
    },

    release(id) {
      const segment = segments.get(id);
      if (!segment) {
        return err(
          novaError({
            code: 'memory/unknown-segment',
            severity: 'recoverable',
            message: `No segment with id ${id} to release.`,
          }),
        );
      }
      segments.delete(id);
      freeBlocks.push({ base: segment.base, size: segment.size });
      coalesce();
      return ok(undefined);
    },

    getSegment(address) {
      for (const segment of segments.values()) {
        if (address >= segment.base && address < segment.base + segment.size) return segment;
      }
      return null;
    },

    listSegments() {
      return [...segments.values()].sort((a, b) => a.base - b.base);
    },

    memoryMap() {
      const allocated = [...segments.values()];
      const usedBytes = allocated.reduce((sum, segment) => sum + segment.size, 0);
      const freeBytes = sizeBytes - usedBytes;
      const freeSegments: MemorySegment[] = freeBlocks.map((block) => ({
        id: segmentId(`free-${block.base}`),
        ownerPid: null,
        kind: 'free',
        base: block.base,
        size: block.size,
        permissions: defaultPermissions('free'),
        label: 'free',
      }));
      const segmentsView = [...allocated, ...freeSegments].sort((a, b) => a.base - b.base);
      const largestFreeBlock = freeBlocks.reduce((max, block) => Math.max(max, block.size), 0);
      return {
        totalBytes: sizeBytes,
        usedBytes,
        freeBytes,
        segments: segmentsView,
        fragmentation: {
          freeBlocks: freeBlocks.length,
          largestFreeBlock,
          ratio: freeBytes > 0 ? 1 - largestFreeBlock / freeBytes : 0,
        },
      };
    },

    snapshot() {
      return { sizeBytes, data: Array.from(data) };
    },

    restore(snapshot) {
      if (snapshot.sizeBytes !== sizeBytes) {
        return err(
          novaError({
            code: 'memory/snapshot-size-mismatch',
            severity: 'fatal',
            message: `Snapshot RAM size ${snapshot.sizeBytes} does not match this memory (${sizeBytes}).`,
          }),
        );
      }
      data.set(Uint8Array.from(snapshot.data));
      return ok(undefined);
    },
  };
}
