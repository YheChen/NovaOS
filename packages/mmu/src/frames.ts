import type { Result, ProcessId } from '@novaos/shared';
import { ok } from '@novaos/shared';
import type { Pfn, Vpn } from './address';
import { asPfn, asVpn } from './address';

/** What currently occupies a physical frame. */
export interface FrameOccupant {
  readonly pid: ProcessId;
  readonly vpn: Vpn;
}

export interface FrameState {
  readonly index: Pfn;
  occupant: FrameOccupant | null;
}

export interface FrameTableSnapshot {
  readonly frames: readonly FrameState[];
}

export interface PhysicalFrameTable {
  readonly frameCount: number;
  /** First free frame, or null when memory is full (=> replacement needed). */
  allocate(occupant: FrameOccupant): Pfn | null;
  free(frame: Pfn): void;
  occupant(frame: Pfn): FrameOccupant | null;
  frames(): readonly FrameState[];
  snapshot(): FrameTableSnapshot;
  restore(snapshot: FrameTableSnapshot): Result<void>;
}

const cloneFrame = (f: FrameState): FrameState => ({
  index: f.index,
  occupant: f.occupant ? { ...f.occupant } : null,
});

export function createFrameTable(frameCount: number): PhysicalFrameTable {
  const count = Math.max(1, Math.floor(frameCount));
  let frames: FrameState[] = Array.from({ length: count }, (_, i) => ({
    index: asPfn(i),
    occupant: null,
  }));

  return {
    frameCount: count,
    allocate(occupant) {
      const free = frames.find((f) => f.occupant === null);
      if (!free) return null;
      free.occupant = { ...occupant };
      return free.index;
    },
    free(frame) {
      const f = frames[frame as number];
      if (f) f.occupant = null;
    },
    occupant(frame) {
      return frames[frame as number]?.occupant ?? null;
    },
    frames: () => frames.map(cloneFrame),
    snapshot: () => ({ frames: frames.map(cloneFrame) }),
    restore(snapshot) {
      frames = Array.from({ length: count }, (_, i) => {
        const src = snapshot.frames[i];
        return {
          index: asPfn(i),
          occupant: src?.occupant
            ? { pid: src.occupant.pid, vpn: asVpn(src.occupant.vpn as number) }
            : null,
        };
      });
      return ok(undefined);
    },
  };
}
