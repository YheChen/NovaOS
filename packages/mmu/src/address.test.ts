import { describe, it, expect } from 'vitest';
import {
  createAddressGeometry,
  decodeVirtualAddress,
  composePhysicalAddress,
  asVirtualAddress,
  asPfn,
} from './address';

const cfg = { pageSizeBytes: 256, virtualAddressBits: 16, physicalAddressBits: 12 };

describe('address geometry', () => {
  it('rejects a non-power-of-two page size', () => {
    const r = createAddressGeometry({ ...cfg, pageSizeBytes: 100 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('mmu/invalid-config');
  });

  it('rejects an offset that is not smaller than the virtual address width', () => {
    expect(
      createAddressGeometry({ pageSizeBytes: 256, virtualAddressBits: 8, physicalAddressBits: 12 })
        .ok,
    ).toBe(false);
  });

  it('rejects physical bits smaller than the page offset', () => {
    expect(
      createAddressGeometry({ pageSizeBytes: 256, virtualAddressBits: 16, physicalAddressBits: 4 })
        .ok,
    ).toBe(false);
  });

  it('derives the geometry for a valid config', () => {
    const r = createAddressGeometry(cfg);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.offsetBits).toBe(8);
      expect(r.value.vpnBits).toBe(8);
      expect(r.value.pageCount).toBe(256);
      expect(r.value.frameCount).toBe(16);
    }
  });

  it('decodes a VA and composes it back to a physical address', () => {
    const g = createAddressGeometry(cfg);
    if (!g.ok) throw new Error('geometry');
    const d = decodeVirtualAddress(g.value, asVirtualAddress(0x1234));
    expect(d.ok).toBe(true);
    if (d.ok) {
      expect(Number(d.value.vpn)).toBe(0x12);
      expect(d.value.offset).toBe(0x34);
      const pa = composePhysicalAddress(g.value, asPfn(5), d.value.offset);
      expect(Number(pa)).toBe(5 * 256 + 0x34);
    }
  });

  it('rejects a virtual address outside the address space', () => {
    const g = createAddressGeometry(cfg);
    if (!g.ok) throw new Error('geometry');
    const d = decodeVirtualAddress(g.value, asVirtualAddress(2 ** 16));
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.error.code).toBe('mmu/va-out-of-range');
  });
});
