import { describe, it, expect } from 'vitest';
import { createTlb } from './tlb';
import { asVpn, asPfn } from './address';

describe('TLB', () => {
  it('records hits and misses in its stats', () => {
    const tlb = createTlb({ enabled: true, capacity: 4, evictionId: 'fifo' });
    tlb.insert(1, asVpn(0), asPfn(0), 0);
    expect(tlb.lookup(1, asVpn(0), 1).hit).toBe(true);
    expect(tlb.lookup(1, asVpn(9), 2).hit).toBe(false);
    expect(tlb.stats().hits).toBe(1);
    expect(tlb.stats().misses).toBe(1);
  });

  it('FIFO-evicts the first inserted entry at capacity', () => {
    const tlb = createTlb({ enabled: true, capacity: 2, evictionId: 'fifo' });
    tlb.insert(1, asVpn(0), asPfn(0), 0);
    tlb.insert(1, asVpn(1), asPfn(1), 1);
    tlb.insert(1, asVpn(2), asPfn(2), 2); // evicts VPN 0
    expect(tlb.lookup(1, asVpn(0), 3).hit).toBe(false);
    expect(tlb.lookup(1, asVpn(2), 4).hit).toBe(true);
    expect(tlb.stats().evictions).toBe(1);
  });

  it('LRU keeps the recently used entry and evicts the stale one', () => {
    const tlb = createTlb({ enabled: true, capacity: 2, evictionId: 'lru' });
    tlb.insert(1, asVpn(0), asPfn(0), 0); // A
    tlb.insert(1, asVpn(1), asPfn(1), 1); // B
    tlb.lookup(1, asVpn(0), 2); // bump A's recency
    tlb.insert(1, asVpn(2), asPfn(2), 3); // evicts B (least recently used)
    expect(tlb.lookup(1, asVpn(0), 4).hit).toBe(true);
    expect(tlb.lookup(1, asVpn(1), 5).hit).toBe(false);
  });

  it('supports invalidate, flush, and a disabled mode', () => {
    const tlb = createTlb({ enabled: true, capacity: 4, evictionId: 'fifo' });
    tlb.insert(1, asVpn(0), asPfn(0), 0);
    tlb.invalidate(1, asVpn(0));
    expect(tlb.lookup(1, asVpn(0), 1).hit).toBe(false);
    tlb.insert(1, asVpn(1), asPfn(1), 2);
    tlb.flush();
    expect(tlb.lookup(1, asVpn(1), 3).hit).toBe(false);

    const off = createTlb({ enabled: false, capacity: 4, evictionId: 'fifo' });
    off.insert(1, asVpn(0), asPfn(0), 0);
    expect(off.lookup(1, asVpn(0), 1).hit).toBe(false); // disabled → always miss
  });
});
