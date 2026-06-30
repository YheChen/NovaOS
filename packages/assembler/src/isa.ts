import { Opcode } from '@novaos/cpu';

/**
 * The operand kinds an instruction position can accept.
 *
 * - `register`  — R0-R7, plus SP (index 8) and BP (index 9). One byte.
 * - `immediate` — unsigned 0-255, one byte.
 * - `imm16`     — unsigned 0-65535, packed into fields B (high) and C (low).
 * - `simm`      — signed -128..127 displacement, one byte (two's complement).
 * - `label`     — a label reference resolved to a PC-relative signed 16-bit
 *                 byte offset, packed into fields B (high) and C (low).
 * - `memory`    — reserved for a future `[base + offset]` addressing syntax.
 */
export type OperandKind = 'register' | 'immediate' | 'imm16' | 'simm' | 'label' | 'memory';

export interface InstructionSpec {
  readonly opcode: number;
  readonly operands: OperandKind[];
}

/** Mnemonic → opcode + ordered operand kinds. Keys are uppercase. */
export const INSTRUCTION_SPECS: Record<string, InstructionSpec> = {
  NOP: { opcode: Opcode.NOP, operands: [] },
  MOV: { opcode: Opcode.MOV, operands: ['register', 'immediate'] },
  MOVR: { opcode: Opcode.MOVR, operands: ['register', 'register'] },
  LDI: { opcode: Opcode.LDI, operands: ['register', 'imm16'] },
  ADD: { opcode: Opcode.ADD, operands: ['register', 'register', 'register'] },
  SUB: { opcode: Opcode.SUB, operands: ['register', 'register', 'register'] },
  MUL: { opcode: Opcode.MUL, operands: ['register', 'register', 'register'] },
  DIV: { opcode: Opcode.DIV, operands: ['register', 'register', 'register'] },
  MOD: { opcode: Opcode.MOD, operands: ['register', 'register', 'register'] },
  NEG: { opcode: Opcode.NEG, operands: ['register', 'register'] },
  NOT: { opcode: Opcode.NOT, operands: ['register', 'register'] },
  CEQ: { opcode: Opcode.CEQ, operands: ['register', 'register', 'register'] },
  CNE: { opcode: Opcode.CNE, operands: ['register', 'register', 'register'] },
  CLT: { opcode: Opcode.CLT, operands: ['register', 'register', 'register'] },
  CLE: { opcode: Opcode.CLE, operands: ['register', 'register', 'register'] },
  CGT: { opcode: Opcode.CGT, operands: ['register', 'register', 'register'] },
  CGE: { opcode: Opcode.CGE, operands: ['register', 'register', 'register'] },
  AND: { opcode: Opcode.AND, operands: ['register', 'register', 'register'] },
  OR: { opcode: Opcode.OR, operands: ['register', 'register', 'register'] },
  JMP: { opcode: Opcode.JMP, operands: ['label'] },
  JZ: { opcode: Opcode.JZ, operands: ['register', 'label'] },
  JNZ: { opcode: Opcode.JNZ, operands: ['register', 'label'] },
  PUSH: { opcode: Opcode.PUSH, operands: ['register'] },
  POP: { opcode: Opcode.POP, operands: ['register'] },
  CALL: { opcode: Opcode.CALL, operands: ['label'] },
  RET: { opcode: Opcode.RET, operands: [] },
  LOAD: { opcode: Opcode.LOAD, operands: ['register', 'register', 'simm'] },
  STORE: { opcode: Opcode.STORE, operands: ['register', 'register', 'simm'] },
  PRINT: { opcode: Opcode.PRINT, operands: ['register'] },
  SYSCALL: { opcode: Opcode.SYSCALL, operands: ['immediate'] },
  HALT: { opcode: Opcode.HALT, operands: [] },
};

export const KNOWN_MNEMONICS = Object.keys(INSTRUCTION_SPECS);

export const SUPPORTED_DIRECTIVES = ['.global', '.text', '.data'] as const;

/** Parse a register token (`R0`..`R7`, `SP`, `BP`, case-insensitive) to its index. */
export function parseRegister(token: string): number | null {
  const match = /^R([0-7])$/i.exec(token);
  if (match) return Number(match[1]);
  const upper = token.toUpperCase();
  if (upper === 'SP') return 8;
  if (upper === 'BP') return 9;
  return null;
}

/** Parse an immediate token (`42`, `#42`, `-4`, or `0x2a`) to a number, or null. */
export function parseImmediate(token: string): number | null {
  const cleaned = token.startsWith('#') ? token.slice(1) : token;
  if (/^0x[0-9a-f]+$/i.test(cleaned)) return Number.parseInt(cleaned.slice(2), 16);
  if (/^-?\d+$/.test(cleaned)) return Number.parseInt(cleaned, 10);
  return null;
}
