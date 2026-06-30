import { describe, it, expect } from 'vitest';
import { asAddress } from '@novaos/shared';
import { createMemory } from './memory';

const at = (n: number) => asAddress(n);

describe('Memory', () => {
  it('reads back written bytes', () => {
    const mem = createMemory(64);
    expect(mem.writeByte(at(0), 0xab).ok).toBe(true);
    const read = mem.readByte(at(0));
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.value).toBe(0xab);
  });

  it('stores and reads words little-endian', () => {
    const mem = createMemory(64);
    mem.writeWord(at(4), 0x11223344);
    const read = mem.readWord(at(4));
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.value).toBe(0x11223344);
    // Byte 0 of the word is the least-significant byte.
    const low = mem.readByte(at(4));
    if (low.ok) expect(low.value).toBe(0x44);
  });

  it('faults on out-of-bounds access', () => {
    const mem = createMemory(8);
    const read = mem.readByte(at(8));
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.error.code).toBe('memory/out-of-bounds');
    expect(mem.readWord(at(6)).ok).toBe(false);
    expect(mem.writeByte(at(-1), 1).ok).toBe(false);
  });

  it('loads a byte buffer at an address', () => {
    const mem = createMemory(16);
    const result = mem.load(at(2), Uint8Array.from([1, 2, 3]));
    expect(result.ok).toBe(true);
    const read = mem.readByte(at(3));
    if (read.ok) expect(read.value).toBe(2);
  });

  it('snapshots and restores exactly', () => {
    const mem = createMemory(16);
    mem.writeWord(at(0), 0xdeadbeef);
    const snap = mem.snapshot();

    const restored = createMemory(16);
    expect(restored.restore(snap).ok).toBe(true);
    const read = restored.readWord(at(0));
    if (read.ok) expect(read.value).toBe(0xdeadbeef);
  });

  it('rejects a snapshot with a mismatched size', () => {
    const mem = createMemory(16);
    const result = mem.restore({ sizeBytes: 32, data: new Array(32).fill(0) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('memory/snapshot-size-mismatch');
  });
});
