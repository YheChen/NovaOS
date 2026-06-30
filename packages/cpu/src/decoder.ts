import { ok, err, novaError } from '@novaos/shared';
import type { Result } from '@novaos/shared';
import { MNEMONICS, isOpcode } from './opcodes';
import type { DecodedInstruction } from './instruction';

/** Split a 32-bit instruction word into opcode + operands, validating the opcode. */
export function decode(word: number): Result<DecodedInstruction> {
  const raw = word >>> 0;
  const opcode = (raw >>> 24) & 0xff;
  if (!isOpcode(opcode)) {
    return err(
      novaError({
        code: 'cpu/invalid-opcode',
        severity: 'recoverable',
        message: `Unknown opcode 0x${opcode.toString(16).padStart(2, '0')}.`,
      }),
    );
  }
  return ok({
    opcode,
    mnemonic: MNEMONICS[opcode],
    a: (raw >>> 16) & 0xff,
    b: (raw >>> 8) & 0xff,
    c: raw & 0xff,
    raw,
  });
}
