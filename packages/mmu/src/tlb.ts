import type { Result, DeterministicRandom } from '@novaos/shared';
import { ok } from '@novaos/shared';
import type { Vpn, Pfn } from './address';
import { asPfn, asVpn } from './address';

export interface TlbEntry {
  readonly pid: number;
  readonly vpn: Vpn;
  readonly frame: Pfn;
  insertedAtTick: number;
}

export type TlbEvictionId = 'fifo' | 'lru';

export interface TlbLookupResult {
  readonly hit: boolean;
  readonly frame: Pfn | null;
}

export interface TlbStats {
  readonly hits: number;
  readonly misses: number;
  readonly insertions: number;
  readonly evictions: number;
}

export interface TlbSnapshot {
  readonly enabled: boolean;
  readonly capacity: number;
  readonly evictionId: TlbEvictionId;
  readonly entries: readonly TlbEntry[];
  readonly stats: TlbStats;
}

export interface Tlb {
  readonly enabled: boolean;
  readonly capacity: number;
  lookup(pid: number, vpn: Vpn, tick: number): TlbLookupResult;
  insert(pid: number, vpn: Vpn, frame: Pfn, tick: number): void;
  invalidate(pid: number, vpn: Vpn): void;
  flush(): void;
  stats(): TlbStats;
  snapshot(): TlbSnapshot;
  restore(snapshot: TlbSnapshot): Result<void>;
}

export interface CreateTlbOptions {
  readonly enabled: boolean;
  readonly capacity: number;
  readonly evictionId: TlbEvictionId;
  /** Reserved; eviction is deterministic without it. */
  readonly random?: DeterministicRandom;
}

interface InternalEntry extends TlbEntry {
  recency: number;
}

export function createTlb(options: CreateTlbOptions): Tlb {
  const capacity = Math.max(1, Math.floor(options.capacity));
  const enabled = options.enabled;
  const evictionId = options.evictionId;
  let entries: InternalEntry[] = [];
  let recencyCounter = 0;
  let hits = 0;
  let misses = 0;
  let insertions = 0;
  let evictions = 0;

  const find = (pid: number, vpn: Vpn): InternalEntry | undefined =>
    entries.find((e) => e.pid === pid && (e.vpn as number) === (vpn as number));

  const evictOne = (): void => {
    if (entries.length === 0) return;
    let victimIndex = 0;
    if (evictionId === 'lru') {
      let min = Number.POSITIVE_INFINITY;
      entries.forEach((e, i) => {
        if (e.recency < min) {
          min = e.recency;
          victimIndex = i;
        }
      });
    }
    entries.splice(victimIndex, 1);
    evictions += 1;
  };

  return {
    enabled,
    capacity,
    lookup(pid, vpn, _tick) {
      if (!enabled) return { hit: false, frame: null };
      const e = find(pid, vpn);
      if (e) {
        hits += 1;
        recencyCounter += 1;
        e.recency = recencyCounter;
        return { hit: true, frame: e.frame };
      }
      misses += 1;
      return { hit: false, frame: null };
    },
    insert(pid, vpn, frame, tick) {
      if (!enabled) return;
      const existing = find(pid, vpn);
      recencyCounter += 1;
      if (existing) {
        entries = entries.map((e) =>
          e === existing ? { ...e, frame, insertedAtTick: tick, recency: recencyCounter } : e,
        );
        return;
      }
      if (entries.length >= capacity) evictOne();
      entries.push({ pid, vpn, frame, insertedAtTick: tick, recency: recencyCounter });
      insertions += 1;
    },
    invalidate(pid, vpn) {
      entries = entries.filter((e) => !(e.pid === pid && (e.vpn as number) === (vpn as number)));
    },
    flush() {
      entries = [];
    },
    stats: () => ({ hits, misses, insertions, evictions }),
    snapshot: () => ({
      enabled,
      capacity,
      evictionId,
      entries: entries.map((e) => ({
        pid: e.pid,
        vpn: e.vpn,
        frame: e.frame,
        insertedAtTick: e.insertedAtTick,
      })),
      stats: { hits, misses, insertions, evictions },
    }),
    restore(snapshot) {
      entries = snapshot.entries.map((e, i) => ({
        pid: e.pid,
        vpn: asVpn(e.vpn as number),
        frame: asPfn(e.frame as number),
        insertedAtTick: e.insertedAtTick,
        recency: i,
      }));
      recencyCounter = entries.length;
      hits = snapshot.stats.hits;
      misses = snapshot.stats.misses;
      insertions = snapshot.stats.insertions;
      evictions = snapshot.stats.evictions;
      return ok(undefined);
    },
  };
}
