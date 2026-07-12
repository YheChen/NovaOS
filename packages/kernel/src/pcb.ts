import type { ProcessId } from '@novaos/shared';
import type { RegisterFileSnapshot } from '@novaos/cpu';
import type { MemorySegment } from '@novaos/memory';
import type { ProcessState } from './process-state';

/** Why a process left the running state. */
export type ExitReason = 'exited' | 'halted' | 'faulted' | 'killed';

export interface ProcessFault {
  readonly code: string;
  readonly message: string;
  readonly tick: number;
}

/** Per-process segment references (any may be null for placeholder processes). */
export interface ProcessMemoryMap {
  readonly code: MemorySegment | null;
  readonly data: MemorySegment | null;
  readonly heap: MemorySegment | null;
  readonly stack: MemorySegment | null;
}

export interface ProcessSchedulingMetadata {
  quantumRemaining: number;
  lastScheduledAtTick: number | null;
  arrivalSequence: number;
  /** Total estimated CPU burst in ticks, for SJF/SRTF; undefined = no estimate. */
  estimatedBurst?: number;
}

export interface ProcessAccounting {
  cpuTicksUsed: number;
  instructionsExecuted: number;
  syscallsInvoked: number;
  contextSwitches: number;
}

export interface ProcessControlBlock {
  readonly pid: ProcessId;
  readonly parentPid: ProcessId | null;
  readonly name: string;
  state: ProcessState;
  priority: number;
  registers: RegisterFileSnapshot;
  memoryMap: ProcessMemoryMap;
  scheduling: ProcessSchedulingMetadata;
  accounting: ProcessAccounting;
  readonly createdAtTick: number;
  updatedAtTick: number;
  exitCode: number | null;
  fault: ProcessFault | null;
}

export function emptyMemoryMap(): ProcessMemoryMap {
  return { code: null, data: null, heap: null, stack: null };
}

export function memoryBytesOf(map: ProcessMemoryMap): number {
  return (
    (map.code?.size ?? 0) + (map.data?.size ?? 0) + (map.heap?.size ?? 0) + (map.stack?.size ?? 0)
  );
}
