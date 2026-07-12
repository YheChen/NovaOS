import { describe, it, expect } from 'vitest';
import { processId } from '@novaos/shared';
import { createPageTable, defaultPagePermissions } from './page-table';
import { createFrameTable } from './frames';
import { asVpn, asPfn } from './address';

describe('page table', () => {
  it('creates a not-present entry on first touch', () => {
    const pt = createPageTable({ pid: processId(1) });
    const e = pt.entry(asVpn(3));
    expect(e.present).toBe(false);
    expect(e.frame).toBeNull();
  });

  it('maps and unmaps a page', () => {
    const pt = createPageTable({ pid: processId(1) });
    pt.map(asVpn(3), asPfn(2), defaultPagePermissions());
    expect(pt.entry(asVpn(3)).present).toBe(true);
    expect(Number(pt.entry(asVpn(3)).frame)).toBe(2);
    pt.unmap(asVpn(3));
    expect(pt.entry(asVpn(3)).present).toBe(false);
    expect(pt.entry(asVpn(3)).frame).toBeNull();
  });

  it('snapshots entries sorted by VPN and restores independently', () => {
    const pt = createPageTable({ pid: processId(1) });
    pt.map(asVpn(1), asPfn(0), defaultPagePermissions());
    pt.map(asVpn(0), asPfn(1), defaultPagePermissions());
    const snap = pt.snapshot();
    expect(snap.entries.map((e) => Number(e.vpn))).toEqual([0, 1]);

    const restored = createPageTable({ pid: processId(1) });
    restored.restore(snap);
    pt.unmap(asVpn(0)); // mutate the original after restore
    expect(restored.entry(asVpn(0)).present).toBe(true); // restored copy unaffected
  });
});

describe('frame table', () => {
  it('allocates lowest-index-first and reports when full', () => {
    const ft = createFrameTable(2);
    expect(Number(ft.allocate({ pid: processId(1), vpn: asVpn(0) }))).toBe(0);
    expect(Number(ft.allocate({ pid: processId(1), vpn: asVpn(1) }))).toBe(1);
    expect(ft.allocate({ pid: processId(1), vpn: asVpn(2) })).toBeNull();
    ft.free(asPfn(0));
    expect(Number(ft.allocate({ pid: processId(1), vpn: asVpn(3) }))).toBe(0); // reuses freed
  });

  it('reports the occupant of a frame', () => {
    const ft = createFrameTable(1);
    ft.allocate({ pid: processId(2), vpn: asVpn(5) });
    const occ = ft.occupant(asPfn(0));
    expect(occ && Number(occ.vpn)).toBe(5);
  });
});
