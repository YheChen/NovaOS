import { describe, it, expect } from 'vitest';
import { processId, createSimulationClock, stableStringify } from '@novaos/shared';
import { createMmu, type MmuConfig } from './mmu';
import { asVirtualAddress, asVpn } from './address';

// pageSize 16 → offset 4; VA 8 bits → 16 pages; PA 6 bits → 4 frames.
const baseConfig: MmuConfig = {
  address: { pageSizeBytes: 16, virtualAddressBits: 8, physicalAddressBits: 6 },
  replacementId: 'fifo',
  tlb: { enabled: false, capacity: 4, evictionId: 'fifo' },
  seed: 1,
};

function build(overrides: Partial<MmuConfig> = {}) {
  const r = createMmu({ ...baseConfig, ...overrides }, { clock: createSimulationClock() });
  if (!r.ok) throw new Error(`mmu construction failed: ${r.error.message}`);
  return r.value;
}

describe('MMU translation', () => {
  it('faults a page in, then returns the correct physical address', () => {
    const mmu = build();
    mmu.addressSpace(processId(1));
    const r = mmu.translate({ pid: processId(1), address: asVirtualAddress(0x1a), kind: 'read' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.source).toBe('fault-serviced');
      expect(r.value.fault?.loadedFrame).toBe(0);
      expect(Number(r.value.physicalAddress)).toBe(0 * 16 + 0xa); // frame 0, offset 10
      expect(r.value.trace.steps.map((s) => s.stage)).toContain('page-fault-serviced');
    }
  });

  it('sets dirty on write and referenced on any access', () => {
    const mmu = build();
    mmu.addressSpace(processId(1));
    mmu.translate({ pid: processId(1), address: asVirtualAddress(0), kind: 'write' });
    const pte = mmu.pageTable(processId(1))?.entry(asVpn(0));
    expect(pte?.dirty).toBe(true);
    expect(pte?.referenced).toBe(true);
  });

  it('raises a protection fault writing to a read-only page (no dirty, no eviction)', () => {
    const mmu = build();
    mmu.addressSpace(processId(1), () => ({ read: true, write: false, execute: false }));
    const r = mmu.translate({ pid: processId(1), address: asVirtualAddress(0), kind: 'write' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('mmu/protection-fault');
    expect(
      mmu
        .frames()
        .frames()
        .every((f) => f.occupant === null),
    ).toBe(true);
  });

  it('serves a repeat translation from the TLB', () => {
    const mmu = build({ tlb: { enabled: true, capacity: 4, evictionId: 'lru' } });
    mmu.addressSpace(processId(1));
    mmu.translate({ pid: processId(1), address: asVirtualAddress(0), kind: 'read' });
    const r = mmu.translate({ pid: processId(1), address: asVirtualAddress(0), kind: 'read' });
    expect(r.ok && r.value.source).toBe('tlb');
    expect(mmu.tlb().stats().hits).toBe(1);
  });

  it('FIFO-evicts the oldest page once every frame is occupied', () => {
    const mmu = build(); // 4 frames
    mmu.addressSpace(processId(1));
    for (let v = 0; v < 4; v += 1) {
      mmu.translate({ pid: processId(1), address: asVirtualAddress(v * 16), kind: 'read' });
    }
    const r = mmu.translate({ pid: processId(1), address: asVirtualAddress(4 * 16), kind: 'read' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.fault?.evicted?.vpn).toBe(0);
    expect(mmu.pageTable(processId(1))?.entry(asVpn(0)).present).toBe(false);
  });

  it('rejects a virtual address out of range', () => {
    const mmu = build();
    mmu.addressSpace(processId(1));
    const r = mmu.translate({ pid: processId(1), address: asVirtualAddress(999), kind: 'read' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('mmu/va-out-of-range');
  });

  it('is deterministic: the same access sequence and seed yields the same snapshot', () => {
    const run = () => {
      const mmu = build({
        replacementId: 'clock',
        tlb: { enabled: true, capacity: 2, evictionId: 'lru' },
      });
      mmu.addressSpace(processId(1));
      for (const v of [0, 16, 32, 48, 64, 0, 16, 80]) {
        mmu.translate({ pid: processId(1), address: asVirtualAddress(v), kind: 'read' });
      }
      return stableStringify(mmu.snapshot());
    };
    expect(run()).toBe(run());
  });
});
