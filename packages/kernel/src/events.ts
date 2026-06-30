import type { ProcessId, SimTime } from '@novaos/shared';
import type { EventInput } from '@novaos/events';
import type { ProcessState } from './process-state';
import type { ExitReason } from './pcb';
import type { InterruptKind } from './interrupts';

export const KernelEventType = {
  BootStarted: 'kernel.boot.started',
  BootStageCompleted: 'kernel.boot.stage.completed',
  BootCompleted: 'kernel.boot.completed',
  ProcessCreated: 'kernel.process.created',
  ProcessStateChanged: 'kernel.process.state.changed',
  ProcessTerminated: 'kernel.process.terminated',
  ProcessOutput: 'kernel.process.output',
  ContextSwitch: 'kernel.context.switch',
  SyscallInvoked: 'kernel.syscall.invoked',
  SyscallCompleted: 'kernel.syscall.completed',
  SyscallFailed: 'kernel.syscall.failed',
  InterruptRaised: 'kernel.interrupt.raised',
  InterruptHandled: 'kernel.interrupt.handled',
  Fault: 'kernel.fault',
} as const;

export const SchedulerEventType = {
  Initialized: 'scheduler.initialized',
  ProcessEnqueued: 'scheduler.process.enqueued',
  ProcessRemoved: 'scheduler.process.removed',
  Picked: 'scheduler.picked',
} as const;

export type ContextSwitchReason =
  | 'boot'
  | 'dispatch'
  | 'timer-quantum-expired'
  | 'process-exited'
  | 'process-faulted'
  | 'manual-step';

const kernelEvent = (type: string, tick: SimTime, payload: unknown): EventInput => ({
  type,
  tick,
  source: 'kernel',
  payload,
});

const schedulerEvent = (type: string, tick: SimTime, payload: unknown): EventInput => ({
  type,
  tick,
  source: 'scheduler',
  payload,
});

export const bootStartedEvent = (tick: SimTime): EventInput =>
  kernelEvent(KernelEventType.BootStarted, tick, {});

export const bootStageCompletedEvent = (tick: SimTime, stage: string, index: number): EventInput =>
  kernelEvent(KernelEventType.BootStageCompleted, tick, { stage, index });

export const bootCompletedEvent = (tick: SimTime): EventInput =>
  kernelEvent(KernelEventType.BootCompleted, tick, {});

export const processCreatedEvent = (
  tick: SimTime,
  pid: ProcessId,
  name: string,
  parentPid: ProcessId | null,
): EventInput => kernelEvent(KernelEventType.ProcessCreated, tick, { pid, name, parentPid });

export const processStateChangedEvent = (
  tick: SimTime,
  pid: ProcessId,
  previous: ProcessState,
  next: ProcessState,
  reason: string,
): EventInput =>
  kernelEvent(KernelEventType.ProcessStateChanged, tick, { pid, previous, next, reason });

export const processTerminatedEvent = (
  tick: SimTime,
  pid: ProcessId,
  exitCode: number | null,
  reason: ExitReason,
): EventInput => kernelEvent(KernelEventType.ProcessTerminated, tick, { pid, exitCode, reason });

export const processOutputEvent = (
  tick: SimTime,
  pid: ProcessId,
  value: number,
  text: string,
): EventInput => kernelEvent(KernelEventType.ProcessOutput, tick, { pid, value, text });

export const contextSwitchEvent = (
  tick: SimTime,
  previousPid: ProcessId | null,
  nextPid: ProcessId | null,
  reason: ContextSwitchReason,
): EventInput => kernelEvent(KernelEventType.ContextSwitch, tick, { previousPid, nextPid, reason });

export const syscallInvokedEvent = (
  tick: SimTime,
  pid: ProcessId,
  id: number,
  name: string,
  args: number[],
): EventInput => kernelEvent(KernelEventType.SyscallInvoked, tick, { pid, id, name, args });

export const syscallCompletedEvent = (
  tick: SimTime,
  pid: ProcessId,
  id: number,
  name: string,
  result: number | null,
): EventInput => kernelEvent(KernelEventType.SyscallCompleted, tick, { pid, id, name, result });

export const syscallFailedEvent = (
  tick: SimTime,
  pid: ProcessId,
  id: number,
  name: string,
  message: string,
): EventInput => kernelEvent(KernelEventType.SyscallFailed, tick, { pid, id, name, message });

export const interruptRaisedEvent = (
  tick: SimTime,
  kind: InterruptKind,
  source: string,
): EventInput => kernelEvent(KernelEventType.InterruptRaised, tick, { kind, source });

export const interruptHandledEvent = (
  tick: SimTime,
  kind: InterruptKind,
  source: string,
): EventInput => kernelEvent(KernelEventType.InterruptHandled, tick, { kind, source });

export const kernelFaultEvent = (
  tick: SimTime,
  code: string,
  message: string,
  severity: string,
): EventInput => kernelEvent(KernelEventType.Fault, tick, { code, message, severity });

export const schedulerInitializedEvent = (
  tick: SimTime,
  schedulerId: string,
  name: string,
  quantumTicks: number | null,
): EventInput =>
  schedulerEvent(SchedulerEventType.Initialized, tick, { schedulerId, name, quantumTicks });

export const schedulerEnqueuedEvent = (tick: SimTime, pid: ProcessId): EventInput =>
  schedulerEvent(SchedulerEventType.ProcessEnqueued, tick, { pid });

export const schedulerRemovedEvent = (tick: SimTime, pid: ProcessId): EventInput =>
  schedulerEvent(SchedulerEventType.ProcessRemoved, tick, { pid });

export const schedulerPickedEvent = (tick: SimTime, pid: ProcessId): EventInput =>
  schedulerEvent(SchedulerEventType.Picked, tick, { pid });
