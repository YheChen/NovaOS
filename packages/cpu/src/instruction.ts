import type { Opcode } from './opcodes';

/** A decoded instruction: opcode plus its three raw 8-bit operand fields. */
export interface DecodedInstruction {
  readonly opcode: Opcode;
  readonly mnemonic: string;
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly raw: number;
}
