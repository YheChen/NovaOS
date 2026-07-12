import type { DeterministicRandom } from '@novaos/shared';
import type { Vpn, Pfn } from './address';
import { asPfn } from './address';
import type { PageTable } from './page-table';
import type { PhysicalFrameTable } from './frames';

export type ReplacementPolicyId = 'fifo' | 'clock';

/** A resident page eligible for eviction. */
export interface ResidentPage {
  readonly frame: Pfn;
  readonly pid: number;
  readonly vpn: Vpn;
}

export interface ReplacementContext {
  readonly frames: PhysicalFrameTable;
  readonly pageTableOf: (pid: number) => PageTable | undefined;
  /** Reserved for deliberately-deterministic tie-breaks; unused by shipped policies. */
  readonly random: DeterministicRandom;
  readonly tick: number;
}

export interface ReplacementSnapshot {
  readonly policyId: ReplacementPolicyId;
  /** FIFO: insertion-ordered frame list. Clock: the ring buffer. */
  readonly order: number[];
  /** Clock hand index into `order`; `null` for FIFO or an empty ring. */
  readonly hand: number | null;
}

export interface ReplacementPolicy {
  readonly id: ReplacementPolicyId;
  readonly name: string;
  onLoad(page: ResidentPage): void;
  onEvict(page: ResidentPage): void;
  /** Choose a victim; never returns null once at least one frame is occupied. */
  selectVictim(ctx: ReplacementContext): ResidentPage;
  snapshot(): ReplacementSnapshot;
  restore(snapshot: ReplacementSnapshot): void;
}

function residentFor(ctx: ReplacementContext, frame: number): ResidentPage {
  const occ = ctx.frames.occupant(asPfn(frame));
  if (!occ) throw new Error(`Replacement selected an unoccupied frame ${frame}.`);
  return { frame: asPfn(frame), pid: occ.pid as number, vpn: occ.vpn };
}

export function createFifoPolicy(): ReplacementPolicy {
  let order: number[] = [];
  return {
    id: 'fifo',
    name: 'FIFO',
    onLoad(page) {
      order.push(page.frame as number);
    },
    onEvict(page) {
      order = order.filter((f) => f !== (page.frame as number));
    },
    selectVictim(ctx) {
      const head = order[0];
      if (head === undefined) throw new Error('FIFO selectVictim called with an empty ring.');
      return residentFor(ctx, head);
    },
    snapshot: () => ({ policyId: 'fifo', order: [...order], hand: null }),
    restore(snapshot) {
      order = [...snapshot.order];
    },
  };
}

export function createClockPolicy(): ReplacementPolicy {
  let order: number[] = [];
  let hand = 0;
  return {
    id: 'clock',
    name: 'Clock (second-chance)',
    onLoad(page) {
      order.push(page.frame as number);
      if (order.length === 1) hand = 0;
    },
    onEvict(page) {
      const idx = order.indexOf(page.frame as number);
      if (idx < 0) return;
      order.splice(idx, 1);
      if (order.length === 0) hand = 0;
      else if (idx < hand) hand -= 1;
      hand %= order.length;
    },
    selectVictim(ctx) {
      if (order.length === 0) throw new Error('Clock selectVictim called with an empty ring.');
      // At most two sweeps: the first clears reference bits, the second evicts.
      for (let steps = 0; steps < order.length * 2 + 1; steps += 1) {
        const frame = order[hand] as number;
        const occ = ctx.frames.occupant(asPfn(frame));
        if (!occ) return residentFor(ctx, frame);
        const pte = ctx.pageTableOf(occ.pid as number)?.entry(occ.vpn);
        if (pte && pte.referenced) {
          pte.referenced = false; // give it a second chance
          hand = (hand + 1) % order.length;
          continue;
        }
        return residentFor(ctx, frame);
      }
      // Unreachable in practice; fall back to the hand position.
      return residentFor(ctx, order[hand] as number);
    },
    snapshot: () => ({ policyId: 'clock', order: [...order], hand: order.length ? hand : null }),
    restore(snapshot) {
      order = [...snapshot.order];
      hand = snapshot.hand ?? 0;
    },
  };
}

export function createReplacementPolicy(id: ReplacementPolicyId): ReplacementPolicy {
  return id === 'clock' ? createClockPolicy() : createFifoPolicy();
}
