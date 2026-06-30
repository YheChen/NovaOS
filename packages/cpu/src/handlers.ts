import { ok, err, novaError } from '@novaos/shared';
import type { Result } from '@novaos/shared';
import { Opcode } from './opcodes';
import type { DecodedInstruction } from './instruction';
import { gprNameFromIndex } from './register-file';
import type { FlagsRegister, RegisterFileSnapshot, RegisterName } from './register-file';
import { computeArithmeticFlags, computeMoveFlags } from './flags';

export interface RegisterWrite {
  readonly name: RegisterName;
  readonly value: number;
}

export interface OutputEffect {
  readonly register: RegisterName;
  readonly value: number;
  readonly text: string;
}

/**
 * The pure result of executing an instruction. Handlers do not mutate state or
 * emit events; the CPU step applies the effect and emits the resulting events.
 */
export interface InstructionEffect {
  readonly registerWrites: readonly RegisterWrite[];
  /** New flags, or `null` when the instruction does not affect flags. */
  readonly flags: FlagsRegister | null;
  readonly output: OutputEffect | null;
  readonly halt: boolean;
  readonly cycles: number;
}

export type InstructionHandler = (
  instruction: DecodedInstruction,
  registers: RegisterFileSnapshot,
) => Result<InstructionEffect>;

const mask32 = (value: number): number => value >>> 0;

function gpr(index: number): Result<RegisterName> {
  const name = gprNameFromIndex(index);
  if (!name) {
    return err(
      novaError({
        code: 'cpu/invalid-register',
        severity: 'recoverable',
        message: `Invalid general-purpose register index ${index} (expected 0-7).`,
      }),
    );
  }
  return ok(name);
}

function readReg(registers: RegisterFileSnapshot, name: RegisterName): number {
  return registers[name];
}

const nop: InstructionHandler = () =>
  ok({ registerWrites: [], flags: null, output: null, halt: false, cycles: 1 });

const halt: InstructionHandler = () =>
  ok({ registerWrites: [], flags: null, output: null, halt: true, cycles: 1 });

// MOV dst, imm8 — copy an immediate (0-255) into a register; updates Z and N.
const mov: InstructionHandler = (instruction, registers) => {
  const dst = gpr(instruction.a);
  if (!dst.ok) return dst;
  const value = mask32(instruction.b);
  return ok({
    registerWrites: [{ name: dst.value, value }],
    flags: computeMoveFlags(registers.flags, value),
    output: null,
    halt: false,
    cycles: 1,
  });
};

// ADD dst, lhs, rhs — dst = lhs + rhs; updates Z, N, C, O.
const add: InstructionHandler = (instruction, registers) => {
  const dst = gpr(instruction.a);
  if (!dst.ok) return dst;
  const lhsReg = gpr(instruction.b);
  if (!lhsReg.ok) return lhsReg;
  const rhsReg = gpr(instruction.c);
  if (!rhsReg.ok) return rhsReg;

  const lhs = readReg(registers, lhsReg.value);
  const rhs = readReg(registers, rhsReg.value);
  const sum = lhs + rhs;
  const result = sum >>> 0;
  const carry = sum > 0xffffffff;
  const overflow = ((lhs ^ result) & (rhs ^ result) & 0x80000000) !== 0;

  return ok({
    registerWrites: [{ name: dst.value, value: result }],
    flags: computeArithmeticFlags(registers.flags, result, carry, overflow),
    output: null,
    halt: false,
    cycles: 1,
  });
};

// PRINT src — write the register's value to the output device as a decimal line.
const print: InstructionHandler = (instruction, registers) => {
  const src = gpr(instruction.a);
  if (!src.ok) return src;
  const value = readReg(registers, src.value);
  return ok({
    registerWrites: [],
    flags: null,
    output: { register: src.value, value, text: `${value}\n` },
    halt: false,
    cycles: 1,
  });
};

export const HANDLERS: Record<Opcode, InstructionHandler> = {
  [Opcode.NOP]: nop,
  [Opcode.MOV]: mov,
  [Opcode.ADD]: add,
  [Opcode.PRINT]: print,
  [Opcode.HALT]: halt,
};
