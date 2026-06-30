import { describe, it, expect } from 'vitest';
import { createRegisterFile, gprNameFromIndex, INITIAL_FLAGS } from './register-file';

describe('RegisterFile', () => {
  it('resets to zeros and initial flags', () => {
    const rf = createRegisterFile();
    const snap = rf.snapshot();
    expect(snap.r0).toBe(0);
    expect(snap.pc).toBe(0);
    expect(snap.flags).toEqual(INITIAL_FLAGS);
  });

  it('masks register writes to unsigned 32-bit', () => {
    const rf = createRegisterFile();
    rf.set('r0', 0x1_0000_0005);
    expect(rf.get('r0')).toBe(5);
    rf.set('r1', -1);
    expect(rf.get('r1')).toBe(0xffffffff);
  });

  it('applies initial overrides on reset', () => {
    const rf = createRegisterFile();
    rf.reset({ pc: 16, sp: 100, bp: 100 });
    expect(rf.get('pc')).toBe(16);
    expect(rf.get('sp')).toBe(100);
  });

  it('snapshots are independent copies', () => {
    const rf = createRegisterFile();
    const snap = rf.snapshot();
    rf.set('r0', 42);
    expect(snap.r0).toBe(0);
    rf.restore(snap);
    expect(rf.get('r0')).toBe(0);
  });

  it('maps general-purpose register indices to names', () => {
    expect(gprNameFromIndex(0)).toBe('r0');
    expect(gprNameFromIndex(7)).toBe('r7');
    expect(gprNameFromIndex(8)).toBeUndefined();
    expect(gprNameFromIndex(-1)).toBeUndefined();
  });
});
