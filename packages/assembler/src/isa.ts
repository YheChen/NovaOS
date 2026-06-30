import { Opcode } from '@novaos/cpu';

/**
 * The operand kinds an instruction position can accept. Milestone 4's ISA uses
 * only `register` and `immediate`; `label` and `memory` are recognized by the
 * parser but no current instruction accepts them (reserved for JMP/LOAD/STORE).
 */
export type OperandKind = 'register' | 'immediate' | 'label' | 'memory';

export interface InstructionSpec {
  readonly opcode: number;
  readonly operands: OperandKind[];
}

/** Mnemonic → opcode + ordered operand kinds. Keys are uppercase. */
export const INSTRUCTION_SPECS: Record<string, InstructionSpec> = {
  NOP: { opcode: Opcode.NOP, operands: [] },
  MOV: { opcode: Opcode.MOV, operands: ['register', 'immediate'] },
  ADD: { opcode: Opcode.ADD, operands: ['register', 'register', 'register'] },
  PRINT: { opcode: Opcode.PRINT, operands: ['register'] },
  SYSCALL: { opcode: Opcode.SYSCALL, operands: ['immediate'] },
  HALT: { opcode: Opcode.HALT, operands: [] },
};

export const KNOWN_MNEMONICS = Object.keys(INSTRUCTION_SPECS);

export const SUPPORTED_DIRECTIVES = ['.global', '.text', '.data'] as const;

/** Parse a register token (`R0`..`R7`, case-insensitive) to its index, or null. */
export function parseRegister(token: string): number | null {
  const match = /^R([0-7])$/i.exec(token);
  return match ? Number(match[1]) : null;
}

/** Parse an immediate token (`42`, `#42`, or `0x2a`) to a number, or null. */
export function parseImmediate(token: string): number | null {
  const cleaned = token.startsWith('#') ? token.slice(1) : token;
  if (/^0x[0-9a-f]+$/i.test(cleaned)) return Number.parseInt(cleaned.slice(2), 16);
  if (/^-?\d+$/.test(cleaned)) return Number.parseInt(cleaned, 10);
  return null;
}
