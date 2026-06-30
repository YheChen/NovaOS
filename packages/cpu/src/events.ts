import type { SimTime } from '@novaos/shared';
import type { EventInput } from '@novaos/events';
import type { DecodedInstruction } from './instruction';
import type { FlagsRegister, RegisterName } from './register-file';
import type { VmFault } from './faults';

export const CpuEventType = {
  Fetched: 'cpu.instruction.fetched',
  Executed: 'cpu.instruction.executed',
  RegisterChanged: 'cpu.register.changed',
  FlagsChanged: 'cpu.flags.changed',
  Output: 'cpu.output',
  Halted: 'cpu.halted',
  FaultRaised: 'cpu.fault.raised',
} as const;

export interface FetchedPayload {
  pc: number;
  raw: number;
}
export interface ExecutedPayload {
  pc: number;
  opcode: number;
  mnemonic: string;
}
export interface RegisterChangedPayload {
  register: RegisterName;
  previous: number;
  next: number;
}
export interface FlagsChangedPayload {
  previous: FlagsRegister;
  next: FlagsRegister;
}
export interface OutputPayload {
  register: RegisterName;
  value: number;
  text: string;
}
export interface HaltedPayload {
  pc: number;
}
export interface FaultPayload {
  code: string;
  pc: number;
  message: string;
}

const cpuEvent = (type: string, tick: SimTime, payload: unknown): EventInput => ({
  type,
  tick,
  source: 'cpu',
  payload,
});

export const fetchedEvent = (tick: SimTime, pc: number, raw: number): EventInput =>
  cpuEvent(CpuEventType.Fetched, tick, { pc, raw } satisfies FetchedPayload);

export const executedEvent = (
  tick: SimTime,
  pc: number,
  instruction: DecodedInstruction,
): EventInput =>
  cpuEvent(CpuEventType.Executed, tick, {
    pc,
    opcode: instruction.opcode,
    mnemonic: instruction.mnemonic,
  } satisfies ExecutedPayload);

export const registerChangedEvent = (
  tick: SimTime,
  register: RegisterName,
  previous: number,
  next: number,
): EventInput =>
  cpuEvent(CpuEventType.RegisterChanged, tick, {
    register,
    previous,
    next,
  } satisfies RegisterChangedPayload);

export const flagsChangedEvent = (
  tick: SimTime,
  previous: FlagsRegister,
  next: FlagsRegister,
): EventInput =>
  cpuEvent(CpuEventType.FlagsChanged, tick, { previous, next } satisfies FlagsChangedPayload);

export const outputEvent = (
  tick: SimTime,
  register: RegisterName,
  value: number,
  text: string,
): EventInput =>
  cpuEvent(CpuEventType.Output, tick, { register, value, text } satisfies OutputPayload);

export const haltedEvent = (tick: SimTime, pc: number): EventInput =>
  cpuEvent(CpuEventType.Halted, tick, { pc } satisfies HaltedPayload);

export const faultEvent = (tick: SimTime, fault: VmFault): EventInput =>
  cpuEvent(CpuEventType.FaultRaised, tick, {
    code: fault.code,
    pc: fault.pc,
    message: fault.message,
  } satisfies FaultPayload);
