import { describe, it, expect } from 'vitest';
import { createSeededRandom } from '@novaos/shared';
import { createMemory } from './memory';
import type { MemorySegment } from './segments';

/**
 * Property/fuzz test: over a long random sequence of reserve/release operations,
 * the first-fit allocator must never hand out overlapping or out-of-bounds
 * segments. Uses a seeded PRNG so any failure is reproducible.
 */
describe('allocator (property)', () => {
  it('never produces overlapping or out-of-bounds segments', () => {
    const CAP = 4096;
    const rng = createSeededRandom(20260707);
    const mem = createMemory(CAP);
    const live: MemorySegment[] = [];

    for (let i = 0; i < 800; i += 1) {
      const reserve = live.length === 0 || rng.nextInt(0, 3) !== 0;
      if (reserve) {
        const result = mem.reserve({ ownerPid: 1, kind: 'heap', size: rng.nextInt(1, 300) });
        if (!result.ok) continue; // out of space is a legitimate outcome
        const seg = result.value;
        expect(seg.base).toBeGreaterThanOrEqual(0);
        expect(seg.base + seg.size).toBeLessThanOrEqual(CAP);
        for (const other of live) {
          const disjoint = seg.base + seg.size <= other.base || other.base + other.size <= seg.base;
          expect(disjoint).toBe(true);
        }
        live.push(seg);
      } else {
        const [seg] = live.splice(rng.nextInt(0, live.length), 1);
        expect(mem.release((seg as MemorySegment).id).ok).toBe(true);
      }
    }
  });
});
