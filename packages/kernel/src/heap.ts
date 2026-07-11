/**
 * A first-fit heap allocator over a single process heap segment. Backs the
 * `malloc`/`free` syscalls. Addresses are absolute (within `[base, base+size)`),
 * so `peek`/`poke` can read/write them directly. Deterministic.
 */
export interface HeapBlock {
  readonly start: number;
  readonly size: number;
  readonly free: boolean;
}

export interface Heap {
  /** Allocate `size` bytes (rounded up to a word); returns the address, or 0 if full. */
  malloc(size: number): number;
  /** Free a previously allocated address; returns false if it was not allocated. */
  free(address: number): boolean;
  /** A sorted view of allocated + free spans, for the heap visualizer. */
  blocks(): HeapBlock[];
}

const align4 = (n: number): number => (n + 3) & ~3;

interface Span {
  start: number;
  len: number;
}

export function createHeap(base: number, size: number): Heap {
  let freeSpans: Span[] = size > 0 ? [{ start: base, len: size }] : [];
  const allocated = new Map<number, number>();

  const coalesce = (): void => {
    freeSpans.sort((a, b) => a.start - b.start);
    const merged: Span[] = [];
    for (const span of freeSpans) {
      const last = merged[merged.length - 1];
      if (last && last.start + last.len === span.start) last.len += span.len;
      else merged.push({ ...span });
    }
    freeSpans = merged;
  };

  return {
    malloc(size) {
      const need = align4(size);
      if (need <= 0) return 0;
      const index = freeSpans.findIndex((s) => s.len >= need);
      if (index < 0) return 0;
      const span = freeSpans[index] as Span;
      const address = span.start;
      span.start += need;
      span.len -= need;
      if (span.len === 0) freeSpans.splice(index, 1);
      allocated.set(address, need);
      return address;
    },
    free(address) {
      const len = allocated.get(address);
      if (len === undefined) return false;
      allocated.delete(address);
      freeSpans.push({ start: address, len });
      coalesce();
      return true;
    },
    blocks() {
      const all: HeapBlock[] = [
        ...[...allocated.entries()].map(([start, len]) => ({ start, size: len, free: false })),
        ...freeSpans.map((s) => ({ start: s.start, size: s.len, free: true })),
      ];
      return all.sort((a, b) => a.start - b.start);
    },
  };
}
