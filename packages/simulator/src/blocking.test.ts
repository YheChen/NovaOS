import { describe, it, expect } from 'vitest';
import { compileToyC } from '@novaos/compiler';
import { createNovaRuntime } from './runtime';
import type { ProgramImage } from './program';

function compile(source: string): ProgramImage {
  const result = compileToyC(source, { fileName: 'p.c' });
  if (!result.bytecode) {
    throw new Error(`compile failed: ${result.diagnostics.map((d) => d.message).join('; ')}`);
  }
  return { code: result.bytecode.code, entryPoint: result.bytecode.entryPoint };
}

describe('sleep()', () => {
  it('runs to completion after idle-advancing the clock past the sleep', () => {
    const runtime = createNovaRuntime();
    runtime.boot();
    runtime.spawn('sleeper', compile('int main() { sleep(10); print(42); return 0; }'));
    runtime.run();
    expect(runtime.getOutput().trim()).toBe('42');
    // The clock idled forward at least the requested sleep duration.
    expect(runtime.getSnapshot().clock).toBeGreaterThanOrEqual(10);
  });

  it('marks the process sleeping mid-run', () => {
    const runtime = createNovaRuntime();
    runtime.boot();
    const pid = runtime.spawn('sleeper', compile('int main() { sleep(50); print(1); return 0; }'));
    // Step until the process blocks on sleep.
    for (let i = 0; i < 50; i += 1) {
      runtime.step();
      if (runtime.getKernel().getProcess(pid)?.state === 'sleeping') break;
    }
    expect(runtime.getKernel().getProcess(pid)?.state).toBe('sleeping');
    expect(runtime.getKernel().hasSleepers()).toBe(true);
    // Finishing the run wakes it and completes.
    runtime.run();
    expect(runtime.getOutput().trim()).toBe('1');
  });
});

describe('yield()', () => {
  it('a program that yields still completes', () => {
    const runtime = createNovaRuntime();
    runtime.boot();
    runtime.spawn('y', compile('int main() { yield(); print(7); return 0; }'));
    runtime.run();
    expect(runtime.getOutput().trim()).toBe('7');
  });

  it('two processes both make progress when one yields', () => {
    const runtime = createNovaRuntime({ scheduler: 'fifo' });
    runtime.boot();
    runtime.spawn('a', compile('int main() { yield(); print(1); return 0; }'));
    runtime.spawn('b', compile('int main() { print(2); return 0; }'));
    runtime.run();
    const out = runtime.getOutput();
    expect(out).toContain('1');
    expect(out).toContain('2');
  });
});
