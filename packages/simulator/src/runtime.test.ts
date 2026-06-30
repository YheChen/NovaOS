import { describe, it, expect } from 'vitest';
import { Opcode } from '@novaos/cpu';
import { expectEvents } from '@novaos/testing';
import { buildProgram } from './program';
import { createNovaRuntime } from './runtime';

// User program: print 15 via syscall, then exit(0).
//   MOV R0, 15
//   SYSCALL 0      ; print
//   MOV R0, 0
//   SYSCALL 4      ; exit
const demoProgram = () =>
  buildProgram([
    { opcode: Opcode.MOV, a: 0, b: 15 },
    { opcode: Opcode.SYSCALL, a: 0 },
    { opcode: Opcode.MOV, a: 0, b: 0 },
    { opcode: Opcode.SYSCALL, a: 4 },
  ]);

describe('NovaRuntime — acceptance demo', () => {
  it('boots, runs a user process to exit, and prints 15', () => {
    const runtime = createNovaRuntime({ scheduler: 'round-robin', quantumTicks: 4 });
    runtime.boot();
    const pid = runtime.spawn('hello', demoProgram());

    // While the process is alive its segments appear in the memory map (alongside
    // the reserved kernel region). They are freed on termination.
    const mapWhileAlive = runtime.getMemoryMap();
    expect(mapWhileAlive.segments.some((s) => s.kind === 'kernel')).toBe(true);
    expect(mapWhileAlive.segments.some((s) => s.kind === 'code' && s.ownerPid === pid)).toBe(true);

    const result = runtime.run();

    // Output + exit
    expect(runtime.getOutput()).toBe('15\n');
    expect(runtime.getOutputLines()).toEqual(['15']);
    expect(result.status).toBe('ready');

    // Process table: init + shell placeholders (new) + the user process (terminated, code 0).
    const table = runtime.getProcessTable();
    expect(table.processes.map((p) => p.name)).toEqual(['init', 'shell', 'hello']);
    const hello = table.processes.find((p) => p.pid === pid);
    expect(hello?.state).toBe('terminated');
    expect(hello?.exitCode).toBe(0);
    expect(table.currentPid).toBeNull();

    // The terminated process freed its segments back to RAM.
    expect(runtime.getMemoryMap().segments.some((s) => s.ownerPid === pid)).toBe(false);
  });

  it('emits process-lifecycle and scheduler events', () => {
    const runtime = createNovaRuntime();
    runtime.boot();
    runtime.spawn('hello', demoProgram());
    runtime.run();

    const types = runtime.getEvents().map((e) => e.type);
    expect(types).toContain('scheduler.initialized');
    expect(types).toContain('scheduler.process.enqueued');
    expect(types).toContain('scheduler.picked');
    expect(types).toContain('kernel.context.switch');

    // The key lifecycle order (other events may interleave).
    expectEvents(runtime.getEvents()).toContainSequence([
      'kernel.boot.started',
      'kernel.boot.completed',
      'kernel.process.created', // hello, after boot
      'kernel.context.switch', // dispatch to hello
      'kernel.syscall.invoked', // print
      'kernel.process.output',
      'kernel.syscall.completed',
      'kernel.syscall.invoked', // exit
      'kernel.process.terminated',
    ]);
  });

  it('is deterministic: two runs produce identical events, output, and process table', () => {
    const run = () => {
      const runtime = createNovaRuntime();
      runtime.boot();
      runtime.spawn('hello', demoProgram());
      runtime.run();
      return runtime;
    };
    const a = run();
    const b = run();
    expect(b.getEvents()).toEqual(a.getEvents());
    expect(b.getOutput()).toBe(a.getOutput());
    expect(b.getProcessTable()).toEqual(a.getProcessTable());
  });
});

describe('NovaRuntime — Round Robin context switching', () => {
  it('interleaves two processes via timer-driven preemption', () => {
    const programFor = (value: number) =>
      buildProgram([
        { opcode: Opcode.MOV, a: 0, b: value },
        { opcode: Opcode.NOP },
        { opcode: Opcode.SYSCALL, a: 0 }, // print
        { opcode: Opcode.MOV, a: 0, b: 0 },
        { opcode: Opcode.SYSCALL, a: 4 }, // exit
      ]);

    const runtime = createNovaRuntime({ scheduler: 'round-robin', quantumTicks: 2 });
    runtime.boot();
    const a = runtime.spawn('a', programFor(1));
    const b = runtime.spawn('b', programFor(2));
    runtime.run();

    // Both processes ran and printed; A (admitted first) prints before B.
    expect(runtime.getOutputLines()).toEqual(['1', '2']);

    const table = runtime.getProcessTable();
    expect(table.processes.find((p) => p.pid === a)?.state).toBe('terminated');
    expect(table.processes.find((p) => p.pid === b)?.state).toBe('terminated');

    const types = runtime.getEvents().map((e) => e.type);
    expect(types.filter((t) => t === 'kernel.interrupt.raised').length).toBeGreaterThanOrEqual(1);
    expect(types.filter((t) => t === 'kernel.context.switch').length).toBeGreaterThanOrEqual(3);
  });
});
