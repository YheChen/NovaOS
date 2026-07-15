import { describe, it, expect } from 'vitest';
import { compileToyC } from '@novaos/compiler';
import { createNovaRuntime, type SchedulerChoice } from './runtime';
import type { ProgramImage } from './program';

function compile(source: string): ProgramImage {
  const result = compileToyC(source, { fileName: 'ipc.c' });
  if (!result.bytecode) {
    throw new Error(`compile failed: ${result.diagnostics.map((d) => d.message).join('; ')}`);
  }
  return { code: result.bytecode.code, entryPoint: result.bytecode.entryPoint };
}

const PRODUCER = `int main() {
  int i = 1;
  while (i <= 5) {
    send(0, i);
    i = i + 1;
  }
  return 0;
}`;

const CONSUMER = `int main() {
  int sum = 0;
  int i = 0;
  while (i < 5) {
    sum = sum + receive(0);
    i = i + 1;
  }
  print(sum);
  return 0;
}`;

function producerConsumer(scheduler: SchedulerChoice): string {
  const runtime = createNovaRuntime({ scheduler, quantumTicks: 2 });
  runtime.boot();
  // Spawn the consumer first so it blocks on the empty pipe before any send.
  runtime.spawn('consumer', compile(CONSUMER));
  runtime.spawn('producer', compile(PRODUCER));
  runtime.run();
  return runtime.getOutput().trim();
}

describe('IPC: message-passing pipes', () => {
  it('a consumer receives every value the producer sends, in FIFO order (1..5 = 15)', () => {
    expect(producerConsumer('round-robin')).toBe('15');
  });

  it('the consumer blocks on the empty pipe until the producer sends (non-preemptive)', () => {
    expect(producerConsumer('fifo')).toBe('15');
  });

  it('leaves the consumer blocked when nothing is sent yet', () => {
    const runtime = createNovaRuntime();
    runtime.boot();
    const pid = runtime.spawn('consumer', compile(CONSUMER));
    for (let i = 0; i < 100; i += 1) {
      runtime.step();
      if (runtime.getKernel().getProcess(pid)?.state === 'blocked') break;
    }
    expect(runtime.getKernel().getProcess(pid)?.state).toBe('blocked');
  });
});
