import { describe, it, expect } from 'vitest';
import { createSimulationClock } from '@novaos/shared';
import { createTestEventBus } from '@novaos/testing';
import { createMemory } from '@novaos/memory';
import { createCpu, type RegisterFileSnapshot } from '@novaos/cpu';
import { createRoundRobinScheduler } from '@novaos/scheduler';
import { createKernel } from '@novaos/kernel';
import { createFileSystem, fsContext, DEFAULT_HOME } from '@novaos/filesystem';
import { createShell, type SystemInspector } from '@novaos/shell';
import { createTerminalSession } from './session';

// Adapt live kernel snapshots into the shell's read-only SystemInspector.
// This is the wiring the web app will perform; here it proves the shell reads
// real kernel state.
function kernelInspector(kernel: ReturnType<typeof createKernel>): SystemInspector {
  return {
    processes: () =>
      kernel.getProcessTable().processes.map((p) => ({
        pid: p.pid,
        name: p.name,
        state: p.state,
        priority: p.priority,
        cpuTicks: p.cpuTicksUsed,
        memoryBytes: p.memoryBytes,
        instructions: p.instructionsExecuted,
      })),
    memory: () => {
      const m = kernel.getMemoryMap();
      return {
        totalBytes: m.totalBytes,
        usedBytes: m.usedBytes,
        freeBytes: m.freeBytes,
        segments: m.segments.map((s) => ({
          kind: s.kind,
          base: s.base,
          size: s.size,
          ownerPid: s.ownerPid,
        })),
      };
    },
    cpu: () => null,
    sysinfo: () => {
      const snap = kernel.getSnapshot();
      return {
        version: '0.3.0',
        uptimeTicks: snap.uptimeTicks,
        processCount: snap.processTable.processes.length,
        schedulerName: snap.scheduler.algorithmName,
        totalMemoryBytes: snap.memoryMap.totalBytes,
        usedMemoryBytes: snap.memoryMap.usedBytes,
      };
    },
    kill: (pid) => ({ ok: false, message: `kill ${pid}: not supported in this demo` }),
  };
}

function bootSystem() {
  const clock = createSimulationClock();
  const { bus, recorder } = createTestEventBus();
  const memory = createMemory();
  const cpu = createCpu();
  const scheduler = createRoundRobinScheduler({ quantumTicks: 4 });
  const registerPort = {
    capture: () => cpu.getRegisters(),
    load: (s: RegisterFileSnapshot) => cpu.restoreSnapshot({ registers: s }),
  };
  const kernel = createKernel({
    bus,
    clock,
    memory,
    scheduler,
    registerPort,
    output: { write: () => {} },
  });
  kernel.boot();

  const filesystem = createFileSystem({ clock, bus });
  const shell = createShell();
  const session = createTerminalSession({
    shell,
    filesystem,
    clock,
    system: kernelInspector(kernel),
    bus,
  });
  return { session, filesystem, recorder };
}

const DEMO = [
  'pwd',
  'ls',
  'mkdir demos',
  'cd demos',
  'touch hello.asm',
  'echo "created hello.asm"',
  'cd ..',
  'tree',
  'sysinfo',
];

function runDemo(system: ReturnType<typeof bootSystem>) {
  for (const line of DEMO) {
    system.session.setInput(line);
    system.session.submit();
  }
}

describe('Milestone 3 acceptance demo', () => {
  it('runs the command sequence and changes filesystem state correctly', () => {
    const system = bootSystem();
    runDemo(system);

    // Filesystem changed correctly.
    expect(
      system.filesystem.stat('/home/student/demos/hello.asm', fsContext(DEFAULT_HOME)).ok,
    ).toBe(true);
    expect(system.session.getCwd()).toBe('/home/student');
  });

  it('produces structured terminal output chunks', () => {
    const system = bootSystem();
    runDemo(system);
    const chunks = system.session.getOutput();
    expect(chunks.every((c) => typeof c.id === 'string' && typeof c.text === 'string')).toBe(true);
    expect(chunks.some((c) => c.kind === 'prompt')).toBe(true);
    expect(chunks.some((c) => c.kind === 'stdout')).toBe(true);
    // The very first command's output is the cwd.
    expect(chunks.some((c) => c.kind === 'stdout' && c.text === '/home/student')).toBe(true);
  });

  it('reads real kernel snapshots in sysinfo', () => {
    const system = bootSystem();
    runDemo(system);
    const texts = system.session.getOutput().map((c) => c.text);
    expect(texts).toContain('NovaOS 0.3.0');
    expect(texts.some((t) => t.includes('Round Robin'))).toBe(true);
    expect(texts).toContain('processes: 2'); // init + shell from the booted kernel
  });

  it('emits filesystem, shell, and terminal events', () => {
    const system = bootSystem();
    runDemo(system);
    const types = system.recorder.getEvents().map((e) => e.type);
    expect(types).toContain('kernel.boot.completed');
    expect(types).toContain('filesystem.directory.created');
    expect(types).toContain('filesystem.file.created');
    expect(types).toContain('shell.command.started');
    expect(types).toContain('shell.command.finished');
    expect(types).toContain('terminal.command.submitted');
  });

  it('is deterministic: two runs produce identical terminal output', () => {
    const a = bootSystem();
    runDemo(a);
    const b = bootSystem();
    runDemo(b);
    const render = (s: ReturnType<typeof bootSystem>) =>
      s.session.getOutput().map((c) => `${c.kind}:${c.text}`);
    expect(render(b)).toEqual(render(a));
  });
});
