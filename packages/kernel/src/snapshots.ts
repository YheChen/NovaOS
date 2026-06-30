import type { ProcessId } from '@novaos/shared';
import type { MemoryMapSnapshot } from '@novaos/memory';
import type { SchedulerSnapshot } from '@novaos/scheduler';
import type { ProcessState } from './process-state';
import type { ProcessControlBlock } from './pcb';
import { memoryBytesOf } from './pcb';
import type { KernelFault } from './faults';

export type KernelStatus = 'created' | 'booting' | 'ready' | 'running' | 'halted' | 'faulted';

/** A compact, render-friendly view of one process for the process-table UI. */
export interface ProcessSummary {
  readonly pid: ProcessId;
  readonly parentPid: ProcessId | null;
  readonly name: string;
  readonly state: ProcessState;
  readonly priority: number;
  readonly cpuTicksUsed: number;
  readonly instructionsExecuted: number;
  readonly syscallsInvoked: number;
  readonly memoryBytes: number;
  readonly currentInstructionAddress: number | null;
  readonly exitCode: number | null;
}

export interface ProcessTableSnapshot {
  readonly processes: ProcessSummary[];
  readonly currentPid: ProcessId | null;
}

export interface KernelSnapshot {
  readonly status: KernelStatus;
  readonly currentPid: ProcessId | null;
  readonly uptimeTicks: number;
  readonly processTable: ProcessTableSnapshot;
  readonly scheduler: SchedulerSnapshot;
  readonly memoryMap: MemoryMapSnapshot;
  readonly lastFault: KernelFault | null;
}

export function summarize(pcb: ProcessControlBlock): ProcessSummary {
  return {
    pid: pcb.pid,
    parentPid: pcb.parentPid,
    name: pcb.name,
    state: pcb.state,
    priority: pcb.priority,
    cpuTicksUsed: pcb.accounting.cpuTicksUsed,
    instructionsExecuted: pcb.accounting.instructionsExecuted,
    syscallsInvoked: pcb.accounting.syscallsInvoked,
    memoryBytes: memoryBytesOf(pcb.memoryMap),
    currentInstructionAddress: pcb.memoryMap.code ? pcb.registers.pc : null,
    exitCode: pcb.exitCode,
  };
}
