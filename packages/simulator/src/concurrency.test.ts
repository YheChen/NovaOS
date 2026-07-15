import { describe, it, expect } from 'vitest';
import { compileToyC } from '@novaos/compiler';
import { createNovaRuntime } from './runtime';
import type { ProgramImage } from './program';

function compile(source: string): ProgramImage {
  const result = compileToyC(source, { fileName: 'inc.c' });
  if (!result.bytecode) {
    throw new Error(`compile failed: ${result.diagnostics.map((d) => d.message).join('; ')}`);
  }
  return { code: result.bytecode.code, entryPoint: result.bytecode.entryPoint };
}

/** A program that increments shared word 0 `n` times, optionally under a lock. */
function incrementer(withLock: boolean, n: number): string {
  const critical = withLock
    ? 'lock(0); int v = peek(a); v = v + 1; poke(a, v); unlock(0);'
    : 'int v = peek(a); v = v + 1; poke(a, v);';
  return `int main() {
  int a = shared(0);
  int i = 0;
  while (i < ${n}) {
    ${critical}
    i = i + 1;
  }
  return 0;
}`;
}

/** Run two incrementers concurrently (preempting every tick) and read the counter. */
function finalCounter(withLock: boolean, n: number): number {
  const runtime = createNovaRuntime({ scheduler: 'round-robin', quantumTicks: 1 });
  runtime.boot();
  runtime.spawn('a', compile(incrementer(withLock, n)));
  runtime.spawn('b', compile(incrementer(withLock, n)));
  runtime.run();
  return runtime.readWord(runtime.getKernel().getSharedBase()) ?? -1;
}

describe('kernel concurrency: two processes, one shared counter', () => {
  it('loses updates without a lock (a real, reproducible data race)', () => {
    const result = finalCounter(false, 8);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(16); // interleaved read-modify-write drops updates
  });

  it('is exactly correct once a mutex guards the critical section', () => {
    expect(finalCounter(true, 8)).toBe(16);
  });

  it('is deterministic: the racy result is identical across runs', () => {
    expect(finalCounter(false, 8)).toBe(finalCounter(false, 8));
  });
});
