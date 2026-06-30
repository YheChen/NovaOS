import { ok, err, novaError, asByte } from '@novaos/shared';
import type { Result, Address, Byte } from '@novaos/shared';

/**
 * The Milestone 1 memory core: a flat, byte-addressable, little-endian RAM with
 * bounds-checked access. Memory segments, the allocator, and read/write events
 * arrive in Milestone 2; for now this holds program code and is fetched by the CPU.
 */
export const DEFAULT_RAM_BYTES = 65536;

export interface MemorySnapshot {
  readonly sizeBytes: number;
  readonly data: number[];
}

export interface Memory {
  readonly size: number;
  readByte(address: Address): Result<Byte>;
  writeByte(address: Address, value: number): Result<void>;
  readWord(address: Address): Result<number>;
  writeWord(address: Address, value: number): Result<void>;
  load(address: Address, bytes: Uint8Array): Result<void>;
  snapshot(): MemorySnapshot;
  restore(snapshot: MemorySnapshot): Result<void>;
}

export function createMemory(sizeBytes: number = DEFAULT_RAM_BYTES): Memory {
  const data = new Uint8Array(sizeBytes);

  const inBounds = (address: number, length: number): boolean =>
    Number.isInteger(address) && address >= 0 && address + length <= sizeBytes;

  const outOfBounds = (address: number, length: number) =>
    err(
      novaError({
        code: 'memory/out-of-bounds',
        severity: 'recoverable',
        message: `Access at 0x${address.toString(16)} (length ${length}) is outside RAM (0x0-0x${(sizeBytes - 1).toString(16)}).`,
      }),
    );

  return {
    size: sizeBytes,

    readByte(address) {
      if (!inBounds(address, 1)) return outOfBounds(address, 1);
      return ok(asByte(data[address] ?? 0));
    },

    writeByte(address, value) {
      if (!inBounds(address, 1)) return outOfBounds(address, 1);
      data[address] = value & 0xff;
      return ok(undefined);
    },

    readWord(address) {
      if (!inBounds(address, 4)) return outOfBounds(address, 4);
      const b0 = data[address] ?? 0;
      const b1 = data[address + 1] ?? 0;
      const b2 = data[address + 2] ?? 0;
      const b3 = data[address + 3] ?? 0;
      return ok((b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0);
    },

    writeWord(address, value) {
      if (!inBounds(address, 4)) return outOfBounds(address, 4);
      const word = value >>> 0;
      data[address] = word & 0xff;
      data[address + 1] = (word >>> 8) & 0xff;
      data[address + 2] = (word >>> 16) & 0xff;
      data[address + 3] = (word >>> 24) & 0xff;
      return ok(undefined);
    },

    load(address, bytes) {
      if (!inBounds(address, bytes.length)) return outOfBounds(address, bytes.length);
      data.set(bytes, address);
      return ok(undefined);
    },

    snapshot() {
      return { sizeBytes, data: Array.from(data) };
    },

    restore(snapshot) {
      if (snapshot.sizeBytes !== sizeBytes) {
        return err(
          novaError({
            code: 'memory/snapshot-size-mismatch',
            severity: 'fatal',
            message: `Snapshot RAM size ${snapshot.sizeBytes} does not match this memory (${sizeBytes}).`,
          }),
        );
      }
      data.set(Uint8Array.from(snapshot.data));
      return ok(undefined);
    },
  };
}
