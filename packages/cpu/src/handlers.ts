import { ok, err, novaError, asAddress } from '@novaos/shared';
import type { Result, Address } from '@novaos/shared';
import { Opcode, INSTRUCTION_SIZE } from './opcodes';
import type { DecodedInstruction } from './instruction';
import { gprNameFromIndex, registerNameFromIndex } from './register-file';
import type { FlagsRegister, RegisterFileSnapshot, RegisterName } from './register-file';
import { computeArithmeticFlags, computeMoveFlags } from './flags';

export interface RegisterWrite {
  readonly name: RegisterName;
  readonly value: number;
}

export interface MemoryWrite {
  readonly address: number;
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
 *
 * `memoryWrites` and `nextPc` were added in Milestone 5 for the stack/memory and
 * control-flow instructions. When `nextPc` is defined, the CPU sets PC to it
 * instead of advancing by one instruction.
 */
export interface InstructionEffect {
  readonly registerWrites: readonly RegisterWrite[];
  /** New flags, or `null` when the instruction does not affect flags. */
  readonly flags: FlagsRegister | null;
  readonly output: OutputEffect | null;
  readonly halt: boolean;
  readonly cycles: number;
  readonly memoryWrites?: readonly MemoryWrite[];
  /** Explicit control-flow target (absolute byte address); overrides PC + 4. */
  readonly nextPc?: number;
}

/** The narrow read view of memory a handler needs (LOAD/POP/RET). */
export interface HandlerMemory {
  readWord(address: Address): Result<number>;
}

export type InstructionHandler = (
  instruction: DecodedInstruction,
  registers: RegisterFileSnapshot,
  memory: HandlerMemory,
) => Result<InstructionEffect>;

const mask32 = (value: number): number => value >>> 0;
const toSigned = (value: number): number => value | 0;
const signByte = (b: number): number => ((b & 0x80) !== 0 ? (b & 0xff) - 256 : b & 0xff);
const signWord16 = (w: number): number =>
  (w & 0x8000) !== 0 ? (w & 0xffff) - 0x10000 : w & 0xffff;

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

function anyReg(index: number): Result<RegisterName> {
  const name = registerNameFromIndex(index);
  if (!name) {
    return err(
      novaError({
        code: 'cpu/invalid-register',
        severity: 'recoverable',
        message: `Invalid register index ${index} (expected 0-7, 8=SP, or 9=BP).`,
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

// MOVR dst, src — register-to-register copy (dst/src may be SP/BP). No flags.
const movr: InstructionHandler = (instruction, registers) => {
  const dst = anyReg(instruction.a);
  if (!dst.ok) return dst;
  const src = anyReg(instruction.b);
  if (!src.ok) return src;
  return ok({
    registerWrites: [{ name: dst.value, value: readReg(registers, src.value) }],
    flags: null,
    output: null,
    halt: false,
    cycles: 1,
  });
};

// LDI dst, imm16 — load a 16-bit immediate packed into fields B (high) and C.
const ldi: InstructionHandler = (instruction, registers) => {
  const dst = gpr(instruction.a);
  if (!dst.ok) return dst;
  const value = mask32((instruction.b << 8) | instruction.c);
  return ok({
    registerWrites: [{ name: dst.value, value }],
    flags: computeMoveFlags(registers.flags, value),
    output: null,
    halt: false,
    cycles: 1,
  });
};

// ADD dst, lhs, rhs — dst = lhs + rhs; updates Z, N, C, O. Accepts SP/BP so the
// compiler can do stack-pointer arithmetic.
const add: InstructionHandler = (instruction, registers) => {
  const dst = anyReg(instruction.a);
  if (!dst.ok) return dst;
  const lhsReg = anyReg(instruction.b);
  if (!lhsReg.ok) return lhsReg;
  const rhsReg = anyReg(instruction.c);
  if (!rhsReg.ok) return rhsReg;

  const lhs = readReg(registers, lhsReg.value);
  const rhs = readReg(registers, rhsReg.value);
  const sum = lhs + rhs;
  const result = mask32(sum);
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

/** Shared shape for the register-register ALU ops that just set Z/N. */
function aluBinary(
  instruction: DecodedInstruction,
  registers: RegisterFileSnapshot,
  compute: (lhs: number, rhs: number) => Result<number>,
): Result<InstructionEffect> {
  const dst = anyReg(instruction.a);
  if (!dst.ok) return dst;
  const lhsReg = anyReg(instruction.b);
  if (!lhsReg.ok) return lhsReg;
  const rhsReg = anyReg(instruction.c);
  if (!rhsReg.ok) return rhsReg;
  const computed = compute(readReg(registers, lhsReg.value), readReg(registers, rhsReg.value));
  if (!computed.ok) return computed;
  const result = mask32(computed.value);
  return ok({
    registerWrites: [{ name: dst.value, value: result }],
    flags: computeMoveFlags(registers.flags, result),
    output: null,
    halt: false,
    cycles: 1,
  });
}

function aluUnary(
  instruction: DecodedInstruction,
  registers: RegisterFileSnapshot,
  compute: (value: number) => number,
): Result<InstructionEffect> {
  const dst = anyReg(instruction.a);
  if (!dst.ok) return dst;
  const srcReg = anyReg(instruction.b);
  if (!srcReg.ok) return srcReg;
  const result = mask32(compute(readReg(registers, srcReg.value)));
  return ok({
    registerWrites: [{ name: dst.value, value: result }],
    flags: computeMoveFlags(registers.flags, result),
    output: null,
    halt: false,
    cycles: 1,
  });
}

const sub: InstructionHandler = (i, r) => aluBinary(i, r, (a, b) => ok(a - b));
const mul: InstructionHandler = (i, r) => aluBinary(i, r, (a, b) => ok(Math.imul(a, b)));
const div: InstructionHandler = (i, r) =>
  aluBinary(i, r, (a, b) =>
    b === 0
      ? err(
          novaError({
            code: 'cpu/divide-by-zero',
            severity: 'recoverable',
            message: 'Division by zero.',
          }),
        )
      : ok(Math.trunc(toSigned(a) / toSigned(b))),
  );
const mod: InstructionHandler = (i, r) =>
  aluBinary(i, r, (a, b) =>
    b === 0
      ? err(
          novaError({
            code: 'cpu/divide-by-zero',
            severity: 'recoverable',
            message: 'Modulo by zero.',
          }),
        )
      : ok(toSigned(a) % toSigned(b)),
  );
const neg: InstructionHandler = (i, r) => aluUnary(i, r, (a) => -toSigned(a));
const not: InstructionHandler = (i, r) => aluUnary(i, r, (a) => (a === 0 ? 1 : 0));

const ceq: InstructionHandler = (i, r) => aluBinary(i, r, (a, b) => ok(a === b ? 1 : 0));
const cne: InstructionHandler = (i, r) => aluBinary(i, r, (a, b) => ok(a !== b ? 1 : 0));
const clt: InstructionHandler = (i, r) =>
  aluBinary(i, r, (a, b) => ok(toSigned(a) < toSigned(b) ? 1 : 0));
const cle: InstructionHandler = (i, r) =>
  aluBinary(i, r, (a, b) => ok(toSigned(a) <= toSigned(b) ? 1 : 0));
const cgt: InstructionHandler = (i, r) =>
  aluBinary(i, r, (a, b) => ok(toSigned(a) > toSigned(b) ? 1 : 0));
const cge: InstructionHandler = (i, r) =>
  aluBinary(i, r, (a, b) => ok(toSigned(a) >= toSigned(b) ? 1 : 0));
const and: InstructionHandler = (i, r) => aluBinary(i, r, (a, b) => ok(a !== 0 && b !== 0 ? 1 : 0));
const or: InstructionHandler = (i, r) => aluBinary(i, r, (a, b) => ok(a !== 0 || b !== 0 ? 1 : 0));

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

// JMP rel16 — unconditional PC-relative jump.
const jmp: InstructionHandler = (instruction, registers) =>
  ok({
    registerWrites: [],
    flags: null,
    output: null,
    halt: false,
    cycles: 1,
    nextPc: mask32(registers.pc + signWord16((instruction.b << 8) | instruction.c)),
  });

function conditionalJump(
  instruction: DecodedInstruction,
  registers: RegisterFileSnapshot,
  take: (value: number) => boolean,
): Result<InstructionEffect> {
  const reg = anyReg(instruction.a);
  if (!reg.ok) return reg;
  const base: InstructionEffect = {
    registerWrites: [],
    flags: null,
    output: null,
    halt: false,
    cycles: 1,
  };
  if (!take(readReg(registers, reg.value))) return ok(base);
  return ok({
    ...base,
    nextPc: mask32(registers.pc + signWord16((instruction.b << 8) | instruction.c)),
  });
}

const jz: InstructionHandler = (i, r) => conditionalJump(i, r, (v) => v === 0);
const jnz: InstructionHandler = (i, r) => conditionalJump(i, r, (v) => v !== 0);

// PUSH reg — sp -= 4; mem[sp] = reg.
const push: InstructionHandler = (instruction, registers) => {
  const reg = anyReg(instruction.a);
  if (!reg.ok) return reg;
  const newSp = mask32(registers.sp - INSTRUCTION_SIZE);
  return ok({
    registerWrites: [{ name: 'sp', value: newSp }],
    flags: null,
    output: null,
    halt: false,
    cycles: 1,
    memoryWrites: [{ address: newSp, value: readReg(registers, reg.value) }],
  });
};

// POP reg — reg = mem[sp]; sp += 4.
const pop: InstructionHandler = (instruction, registers, memory) => {
  const reg = anyReg(instruction.a);
  if (!reg.ok) return reg;
  const read = memory.readWord(asAddress(registers.sp));
  if (!read.ok) return read;
  return ok({
    registerWrites: [
      { name: reg.value, value: read.value },
      { name: 'sp', value: mask32(registers.sp + INSTRUCTION_SIZE) },
    ],
    flags: null,
    output: null,
    halt: false,
    cycles: 1,
  });
};

// CALL rel16 — push return address (pc + 4); pc = pc + rel.
const call: InstructionHandler = (instruction, registers) => {
  const newSp = mask32(registers.sp - INSTRUCTION_SIZE);
  const returnAddress = mask32(registers.pc + INSTRUCTION_SIZE);
  return ok({
    registerWrites: [{ name: 'sp', value: newSp }],
    flags: null,
    output: null,
    halt: false,
    cycles: 1,
    memoryWrites: [{ address: newSp, value: returnAddress }],
    nextPc: mask32(registers.pc + signWord16((instruction.b << 8) | instruction.c)),
  });
};

// RET — pc = mem[sp]; sp += 4.
const ret: InstructionHandler = (_instruction, registers, memory) => {
  const read = memory.readWord(asAddress(registers.sp));
  if (!read.ok) return read;
  return ok({
    registerWrites: [{ name: 'sp', value: mask32(registers.sp + INSTRUCTION_SIZE) }],
    flags: null,
    output: null,
    halt: false,
    cycles: 1,
    nextPc: mask32(read.value),
  });
};

// LOAD dst, base, disp8 — dst = mem[base + disp].
const load: InstructionHandler = (instruction, registers, memory) => {
  const dst = anyReg(instruction.a);
  if (!dst.ok) return dst;
  const base = anyReg(instruction.b);
  if (!base.ok) return base;
  const address = mask32(readReg(registers, base.value) + signByte(instruction.c));
  const read = memory.readWord(asAddress(address));
  if (!read.ok) return read;
  return ok({
    registerWrites: [{ name: dst.value, value: read.value }],
    flags: computeMoveFlags(registers.flags, read.value),
    output: null,
    halt: false,
    cycles: 1,
  });
};

// STORE src, base, disp8 — mem[base + disp] = src.
const store: InstructionHandler = (instruction, registers) => {
  const src = anyReg(instruction.a);
  if (!src.ok) return src;
  const base = anyReg(instruction.b);
  if (!base.ok) return base;
  const address = mask32(readReg(registers, base.value) + signByte(instruction.c));
  return ok({
    registerWrites: [],
    flags: null,
    output: null,
    halt: false,
    cycles: 1,
    memoryWrites: [{ address, value: readReg(registers, src.value) }],
  });
};

// SYSCALL and HALT are handled directly by the CPU step (they need the execution
// context), so these table entries are safe fallbacks that should never be reached.
const trapsToKernel: InstructionHandler = () =>
  err(
    novaError({
      code: 'cpu/syscall-requires-trap',
      severity: 'recoverable',
      message: 'SYSCALL must be dispatched through the syscall trap, not the handler table.',
    }),
  );

export const HANDLERS: Record<Opcode, InstructionHandler> = {
  [Opcode.NOP]: nop,
  [Opcode.MOV]: mov,
  [Opcode.MOVR]: movr,
  [Opcode.LDI]: ldi,
  [Opcode.ADD]: add,
  [Opcode.SUB]: sub,
  [Opcode.MUL]: mul,
  [Opcode.DIV]: div,
  [Opcode.MOD]: mod,
  [Opcode.NEG]: neg,
  [Opcode.NOT]: not,
  [Opcode.CEQ]: ceq,
  [Opcode.CNE]: cne,
  [Opcode.CLT]: clt,
  [Opcode.CLE]: cle,
  [Opcode.CGT]: cgt,
  [Opcode.CGE]: cge,
  [Opcode.AND]: and,
  [Opcode.OR]: or,
  [Opcode.JMP]: jmp,
  [Opcode.JZ]: jz,
  [Opcode.JNZ]: jnz,
  [Opcode.PUSH]: push,
  [Opcode.POP]: pop,
  [Opcode.CALL]: call,
  [Opcode.RET]: ret,
  [Opcode.LOAD]: load,
  [Opcode.STORE]: store,
  [Opcode.PRINT]: print,
  [Opcode.SYSCALL]: trapsToKernel,
  [Opcode.HALT]: halt,
};
