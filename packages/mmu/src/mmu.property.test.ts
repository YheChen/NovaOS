import { describe, it, expect } from 'vitest';
import {
  processId,
  createSimulationClock,
  createSeededRandom,
  stableStringify,
} from '@novaos/shared';
import { createMmu, type MmuConfig } from './mmu';
import { asVirtualAddress } from './address';

const config: MmuConfig = {
  address: { pageSizeBytes: 16, virtualAddressBits: 8, physicalAddressBits: 6 }, // 4 frames
  replacementId: 'clock',
  tlb: { enabled: true, capacity: 3, evictionId: 'lru' },
  seed: 99,
};

function runOnce(seed: number): string {
  const built = createMmu(config, { clock: createSimulationClock() });
  if (!built.ok) throw new Error('mmu');
  const mmu = built.value;
  mmu.addressSpace(processId(1));
  const rng = createSeededRandom(seed);

  for (let i = 0; i < 200; i += 1) {
    const vpn = rng.nextInt(0, 12);
    const va = asVirtualAddress(vpn * 16 + rng.nextInt(0, 16));
    const kind = rng.nextInt(0, 2) === 0 ? 'read' : 'write';
    mmu.translate({ pid: processId(1), address: va, kind });

    // (a) Physical occupancy never exceeds the frame count.
    const occupied = mmu
      .frames()
      .frames()
      .filter((f) => f.occupant !== null).length;
    expect(occupied).toBeLessThanOrEqual(mmu.geometry.frameCount);
  }

  // (b) & (c): every present PTE maps to a frame whose occupant is exactly
  // (pid, vpn), and no two present PTEs share a frame.
  const framesSeen = new Map<number, number>();
  const table = mmu.pageTable(processId(1));
  if (table) {
    for (const e of table.entries()) {
      if (e.present && e.frame !== null) {
        const fi = Number(e.frame);
        expect(framesSeen.has(fi)).toBe(false);
        framesSeen.set(fi, Number(e.vpn));
        const occ = mmu.frames().occupant(e.frame);
        expect(occ && Number(occ.vpn)).toBe(Number(e.vpn));
      }
    }
  }

  return stableStringify(mmu.snapshot());
}

describe('MMU invariants (seeded fuzz)', () => {
  it('keeps frames/page-tables consistent and is fully replayable', () => {
    const a = runOnce(7);
    const b = runOnce(7); // (d) same seed → identical snapshot
    expect(a).toBe(b);
  });
});
