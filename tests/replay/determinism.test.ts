import { describe, it, expect } from 'vitest';
import { compileToyC } from '@novaos/compiler';
import { createNovaRuntime } from '@novaos/simulator';

/**
 * Determinism is a feature: the same program + seed must produce the same
 * output and the same ordered event sequence on every run, enabling trustworthy
 * time-travel replay.
 */
const SRC = `int fib(int n) {
  if (n < 2) { return n; }
  return fib(n - 1) + fib(n - 2);
}
int main() {
  print(fib(7));
  return 0;
}
`;

function runOnce() {
  const compiled = compileToyC(SRC, { fileName: 'fib.c' });
  if (!compiled.success || !compiled.bytecode) throw new Error('compile failed');
  const rt = createNovaRuntime({ scheduler: 'fifo', seed: 1 });
  rt.boot();
  rt.spawn('fib', { entryPoint: compiled.bytecode.entryPoint, code: compiled.bytecode.code });
  rt.run();
  return {
    output: rt.getOutput(),
    eventTypes: rt.getEvents().map((e) => e.type),
    eventCount: rt.getEvents().length,
  };
}

describe('deterministic replay', () => {
  it('fib(7) prints 13', () => {
    expect(runOnce().output.trim()).toBe('13');
  });

  it('produces an identical event sequence across independent runs', () => {
    const a = runOnce();
    const b = runOnce();
    expect(a.output).toBe(b.output);
    expect(a.eventCount).toBe(b.eventCount);
    expect(a.eventTypes).toEqual(b.eventTypes);
  });

  it('assigns monotonically increasing event sequence numbers', () => {
    const compiled = compileToyC(SRC, { fileName: 'fib.c' });
    const rt = createNovaRuntime({ scheduler: 'fifo', seed: 1 });
    rt.boot();
    rt.spawn('fib', {
      entryPoint: compiled.bytecode!.entryPoint,
      code: compiled.bytecode!.code,
    });
    rt.run();
    const seqs = rt.getEvents().map((e) => e.sequence);
    for (let i = 1; i < seqs.length; i += 1) {
      expect((seqs[i] as number) > (seqs[i - 1] as number)).toBe(true);
    }
  });
});
