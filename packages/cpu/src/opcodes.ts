/**
 * The Milestone 1 NovaOS instruction set. Instructions are fixed-width 32-bit
 * words: `[ OPCODE(8) | A(8) | B(8) | C(8) ]`.
 *
 * `PRINT` is a temporary M1 convenience instruction so the VM can produce output
 * before the kernel exists; it is superseded by `SYSCALL 0` once the kernel is
 * implemented (Milestone 2).
 */
export const Opcode = {
  NOP: 0,
  MOV: 1,
  ADD: 2,
  PRINT: 3,
  HALT: 255,
} as const;

export type Opcode = (typeof Opcode)[keyof typeof Opcode];

export const MNEMONICS: Record<Opcode, string> = {
  [Opcode.NOP]: 'NOP',
  [Opcode.MOV]: 'MOV',
  [Opcode.ADD]: 'ADD',
  [Opcode.PRINT]: 'PRINT',
  [Opcode.HALT]: 'HALT',
};

/** Instruction width in bytes. */
export const INSTRUCTION_SIZE = 4;

export function isOpcode(value: number): value is Opcode {
  return value in MNEMONICS;
}

/** Pack an opcode and three 8-bit operands into a 32-bit instruction word. */
export function encodeInstruction(opcode: number, a = 0, b = 0, c = 0): number {
  return (((opcode & 0xff) << 24) | ((a & 0xff) << 16) | ((b & 0xff) << 8) | (c & 0xff)) >>> 0;
}
