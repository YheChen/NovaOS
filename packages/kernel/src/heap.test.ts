import { describe, it, expect } from 'vitest';
import { createHeap } from './heap';

describe('heap allocator', () => {
  it('allocates non-overlapping, word-aligned blocks', () => {
    const h = createHeap(1000, 64);
    const a = h.malloc(8);
    const b = h.malloc(8);
    expect(a).toBe(1000);
    expect(b).toBe(1008);
    expect(a % 4).toBe(0);
  });

  it('rounds allocations up to a word', () => {
    const h = createHeap(1000, 64);
    const a = h.malloc(1);
    const b = h.malloc(1);
    expect(b - a).toBe(4);
  });

  it('returns 0 when out of space', () => {
    const h = createHeap(1000, 8);
    expect(h.malloc(8)).toBe(1000);
    expect(h.malloc(4)).toBe(0);
  });

  it('frees and coalesces so the whole heap is reusable', () => {
    const h = createHeap(1000, 16);
    const a = h.malloc(8);
    const b = h.malloc(8);
    expect(h.malloc(4)).toBe(0); // full
    expect(h.free(a)).toBe(true);
    expect(h.free(b)).toBe(true);
    expect(h.malloc(16)).toBe(1000); // coalesced back into one span
  });

  it('reports allocated and free blocks for the visualizer', () => {
    const h = createHeap(0, 32);
    h.malloc(8);
    const blocks = h.blocks();
    expect(blocks[0]).toMatchObject({ start: 0, size: 8, free: false });
    expect(blocks.some((b) => b.free)).toBe(true);
  });
});
