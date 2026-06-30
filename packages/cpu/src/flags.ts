import type { FlagsRegister } from './register-file';

export function flagsEqual(a: FlagsRegister, b: FlagsRegister): boolean {
  return (
    a.zero === b.zero &&
    a.negative === b.negative &&
    a.carry === b.carry &&
    a.overflow === b.overflow &&
    a.interruptEnabled === b.interruptEnabled &&
    a.exception === b.exception
  );
}

const isNegative = (value32: number): boolean => (value32 & 0x80000000) !== 0;

/** Flags after a data-movement instruction: updates Z and N only (per spec §12.1). */
export function computeMoveFlags(previous: FlagsRegister, value32: number): FlagsRegister {
  return { ...previous, zero: value32 === 0, negative: isNegative(value32) };
}

/** Flags after an arithmetic instruction: updates Z, N, C, and O (per spec §12.2). */
export function computeArithmeticFlags(
  previous: FlagsRegister,
  result32: number,
  carry: boolean,
  overflow: boolean,
): FlagsRegister {
  return {
    ...previous,
    zero: result32 === 0,
    negative: isNegative(result32),
    carry,
    overflow,
  };
}
