import type { Brand } from '@novaos/shared';

export type SegmentId = Brand<string, 'SegmentId'>;
export const segmentId = (id: string): SegmentId => id as SegmentId;

export type MemorySegmentKind = 'kernel' | 'code' | 'data' | 'heap' | 'stack' | 'free';

export interface MemoryPermissions {
  readonly read: boolean;
  readonly write: boolean;
  readonly execute: boolean;
}

export interface MemorySegment {
  readonly id: SegmentId;
  /** Owning process id, or `null` for kernel / free regions. */
  readonly ownerPid: number | null;
  readonly kind: MemorySegmentKind;
  readonly base: number;
  readonly size: number;
  readonly permissions: MemoryPermissions;
  readonly label: string;
}

export interface ReserveRequest {
  readonly ownerPid: number | null;
  readonly kind: MemorySegmentKind;
  readonly size: number;
  readonly permissions?: MemoryPermissions;
  readonly label?: string;
}

export interface FragmentationSummary {
  readonly freeBlocks: number;
  readonly largestFreeBlock: number;
  /** 0 (no fragmentation) .. 1 (all free space split into tiny blocks). */
  readonly ratio: number;
}

export interface MemoryMapSnapshot {
  readonly totalBytes: number;
  readonly usedBytes: number;
  readonly freeBytes: number;
  readonly segments: MemorySegment[];
  readonly fragmentation: FragmentationSummary;
}

const RW: MemoryPermissions = { read: true, write: true, execute: false };
const RX: MemoryPermissions = { read: true, write: false, execute: true };
const RWX: MemoryPermissions = { read: true, write: true, execute: true };
const NONE: MemoryPermissions = { read: false, write: false, execute: false };

export function defaultPermissions(kind: MemorySegmentKind): MemoryPermissions {
  switch (kind) {
    case 'code':
      return RX;
    case 'data':
    case 'heap':
    case 'stack':
      return RW;
    case 'kernel':
      return RWX;
    case 'free':
      return NONE;
  }
}
