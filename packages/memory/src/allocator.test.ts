import { describe, it, expect } from 'vitest';
import { asAddress } from '@novaos/shared';
import { createMemory } from './memory';

describe('memory allocator', () => {
  it('reserves contiguous, non-overlapping segments (first-fit)', () => {
    const mem = createMemory(1024);
    const a = mem.reserve({ ownerPid: 1, kind: 'code', size: 256 });
    const b = mem.reserve({ ownerPid: 1, kind: 'stack', size: 128 });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.value.base).toBe(0);
    expect(b.value.base).toBe(256);
    expect(a.value.base + a.value.size).toBeLessThanOrEqual(b.value.base);
    expect(a.value.permissions).toEqual({ read: true, write: false, execute: true }); // code = r-x
    expect(b.value.permissions).toEqual({ read: true, write: true, execute: false }); // stack = rw-
  });

  it('fails to reserve more than is free', () => {
    const mem = createMemory(64);
    const result = mem.reserve({ ownerPid: 1, kind: 'heap', size: 128 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('memory/out-of-memory');
  });

  it('rejects a non-positive size', () => {
    const mem = createMemory(64);
    expect(mem.reserve({ ownerPid: 1, kind: 'heap', size: 0 }).ok).toBe(false);
  });

  it('releases a segment and merges adjacent free blocks', () => {
    const mem = createMemory(1024);
    const a = mem.reserve({ ownerPid: 1, kind: 'code', size: 256 });
    const b = mem.reserve({ ownerPid: 1, kind: 'data', size: 256 });
    if (!a.ok || !b.ok) throw new Error('reserve failed');

    expect(mem.release(a.value.id).ok).toBe(true);
    expect(mem.release(b.value.id).ok).toBe(true);

    // After releasing both adjacent segments, the whole RAM is one free block again.
    const map = mem.memoryMap();
    expect(map.usedBytes).toBe(0);
    expect(map.fragmentation.freeBlocks).toBe(1);
    expect(map.fragmentation.largestFreeBlock).toBe(1024);
  });

  it('locates the segment that owns an address', () => {
    const mem = createMemory(1024);
    const seg = mem.reserve({ ownerPid: 7, kind: 'heap', size: 100, label: 'heap' });
    if (!seg.ok) throw new Error('reserve failed');
    const found = mem.getSegment(asAddress(seg.value.base + 10));
    expect(found?.ownerPid).toBe(7);
    expect(mem.getSegment(asAddress(2000))).toBeNull();
  });

  it('reports a memory map with used/free accounting', () => {
    const mem = createMemory(1000);
    mem.reserve({ ownerPid: null, kind: 'kernel', size: 200 });
    mem.reserve({ ownerPid: 3, kind: 'code', size: 100 });
    const map = mem.memoryMap();
    expect(map.totalBytes).toBe(1000);
    expect(map.usedBytes).toBe(300);
    expect(map.freeBytes).toBe(700);
    // segments view includes the trailing free block, sorted by base.
    expect(map.segments.map((s) => s.kind)).toEqual(['kernel', 'code', 'free']);
  });
});
