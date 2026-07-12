import { describe, it, expect } from 'vitest';
import { processId, createSeededRandom } from '@novaos/shared';
import { createFifoPolicy, createClockPolicy, type ReplacementContext } from './replacement';
import { createFrameTable } from './frames';
import { createPageTable, defaultPagePermissions } from './page-table';
import { asVpn, asPfn } from './address';

function setup(n: number) {
  const frames = createFrameTable(n);
  const pt = createPageTable({ pid: processId(1) });
  for (let i = 0; i < n; i += 1) {
    frames.allocate({ pid: processId(1), vpn: asVpn(i) });
    pt.map(asVpn(i), asPfn(i), defaultPagePermissions());
  }
  const ctx: ReplacementContext = {
    frames,
    pageTableOf: (p) => (p === 1 ? pt : undefined),
    random: createSeededRandom(1),
    tick: 0,
  };
  return { frames, pt, ctx };
}

describe('FIFO replacement', () => {
  it('evicts the oldest-loaded frame', () => {
    const { ctx } = setup(3);
    const fifo = createFifoPolicy();
    fifo.onLoad({ frame: asPfn(0), pid: 1, vpn: asVpn(0) });
    fifo.onLoad({ frame: asPfn(1), pid: 1, vpn: asVpn(1) });
    fifo.onLoad({ frame: asPfn(2), pid: 1, vpn: asVpn(2) });
    const victim = fifo.selectVictim(ctx);
    expect(Number(victim.vpn)).toBe(0);
    fifo.onEvict(victim);
    expect(fifo.snapshot().order).toEqual([1, 2]);
  });
});

describe('Clock replacement', () => {
  it('gives a referenced page a second chance and evicts the next one', () => {
    const { pt, ctx } = setup(3);
    const clock = createClockPolicy();
    clock.onLoad({ frame: asPfn(0), pid: 1, vpn: asVpn(0) });
    clock.onLoad({ frame: asPfn(1), pid: 1, vpn: asVpn(1) });
    clock.onLoad({ frame: asPfn(2), pid: 1, vpn: asVpn(2) });
    pt.entry(asVpn(0)).referenced = true; // VPN0 was recently used

    const victim = clock.selectVictim(ctx);
    expect(Number(victim.vpn)).toBe(1); // VPN0 cleared + skipped; VPN1 evicted
    expect(pt.entry(asVpn(0)).referenced).toBe(false); // second chance consumed
  });

  it('reports the hand position in its snapshot', () => {
    const { ctx } = setup(2);
    const clock = createClockPolicy();
    clock.onLoad({ frame: asPfn(0), pid: 1, vpn: asVpn(0) });
    clock.onLoad({ frame: asPfn(1), pid: 1, vpn: asVpn(1) });
    // Nothing referenced → the hand evicts the frame it points at (frame 0).
    expect(Number(clock.selectVictim(ctx).vpn)).toBe(0);
    expect(clock.snapshot().hand).toBe(0);
  });
});
