import { describe, it, expect } from 'vitest';
import { createSimulationClock } from '@novaos/shared';
import { createTestEventBus } from '@novaos/testing';
import {
  createFileSystem,
  DEFAULT_USER,
  DEFAULT_HOME,
  type AbsolutePath,
} from '@novaos/filesystem';
import { createShell } from './shell';
import { createStaticSystemInspector, type ShellContext, type SystemInspector } from './context';

const inspector: SystemInspector = createStaticSystemInspector({
  processes: [
    {
      pid: 1,
      name: 'init',
      state: 'new',
      priority: 0,
      cpuTicks: 0,
      memoryBytes: 0,
      instructions: 0,
    },
    {
      pid: 2,
      name: 'shell',
      state: 'new',
      priority: 0,
      cpuTicks: 0,
      memoryBytes: 0,
      instructions: 0,
    },
  ],
  memory: {
    totalBytes: 65536,
    usedBytes: 1024,
    freeBytes: 64512,
    segments: [{ kind: 'kernel', base: 0, size: 1024, ownerPid: null }],
  },
  sysinfo: {
    version: '0.3.0',
    uptimeTicks: 0,
    processCount: 2,
    schedulerName: 'Round Robin',
    totalMemoryBytes: 65536,
    usedMemoryBytes: 1024,
  },
});

function harness(withBus = false) {
  const clock = createSimulationClock();
  const bus = withBus ? createTestEventBus() : null;
  const filesystem = createFileSystem(bus ? { clock, bus: bus.bus } : { clock });
  const shell = createShell();
  let cwd: AbsolutePath = DEFAULT_HOME;

  const context = (): ShellContext => {
    const base = {
      user: DEFAULT_USER,
      cwd,
      home: DEFAULT_HOME,
      filesystem,
      clock,
      system: inspector,
    };
    return bus ? { ...base, bus: bus.bus } : base;
  };

  const run = (input: string) => {
    const result = shell.execute(input, context());
    cwd = result.cwd;
    return result;
  };
  const text = (input: string) => run(input).output.map((l) => l.text);

  return {
    shell,
    filesystem,
    run,
    text,
    recorder: bus?.recorder ?? null,
    context,
    getCwd: () => cwd,
  };
}

describe('shell — acceptance command sequence', () => {
  it('runs pwd / ls / mkdir / cd / touch / echo / tree / sysinfo deterministically', () => {
    const h = harness();

    expect(h.text('pwd')).toEqual(['/home/student']);
    expect(h.text('ls')).toEqual(['README.txt  hello.c  main.asm']);

    expect(h.run('mkdir demos').exitCode).toBe(0);
    expect(h.run('cd demos').exitCode).toBe(0);
    expect(h.getCwd()).toBe('/home/student/demos');
    expect(h.run('touch hello.asm').exitCode).toBe(0);
    expect(h.text('echo "created hello.asm"')).toEqual(['created hello.asm']);

    expect(h.run('cd ..').exitCode).toBe(0);
    expect(h.getCwd()).toBe('/home/student');

    const tree = h.text('tree');
    expect(tree[0]).toBe('/home/student');
    expect(tree).toContain('├── demos/');
    expect(tree.some((l) => l.includes('hello.asm'))).toBe(true);

    const sysinfo = h.text('sysinfo');
    expect(sysinfo[0]).toBe('NovaOS 0.3.0');
    expect(sysinfo.some((l) => l.includes('Round Robin'))).toBe(true);
  });
});

describe('shell — diagnostics & system commands', () => {
  it('suggests a similar command when one is not found', () => {
    const h = harness();
    const result = h.run('ecoh hi');
    expect(result.exitCode).toBe(127);
    const text = result.output.map((l) => l.text).join('\n');
    expect(text).toContain('Command not found: ecoh');
    expect(text).toContain('echo');
  });

  it('reads process and memory info from the inspector', () => {
    const h = harness();
    const ps = h.text('ps');
    expect(ps.some((l) => l.includes('init'))).toBe(true);
    expect(ps.some((l) => l.includes('shell'))).toBe(true);
    const mem = h.text('mem');
    expect(mem[0]).toContain('1024/65536');
  });

  it('rm requires -r for a non-empty directory', () => {
    const h = harness();
    h.run('mkdir demos');
    h.run('touch demos/a.txt');
    expect(h.run('rm demos').exitCode).toBe(1);
    expect(h.run('rm -r demos').exitCode).toBe(0);
  });

  it('emits shell + filesystem events on the shared bus', () => {
    const h = harness(true);
    h.run('mkdir demos');
    const types = h.recorder!.getEvents().map((e) => e.type);
    expect(types).toContain('shell.command.started');
    expect(types).toContain('shell.command.finished');
    expect(types).toContain('filesystem.directory.created');
  });
});

describe('shell — autocomplete', () => {
  it('completes command names', () => {
    const h = harness();
    const result = h.shell.complete('tou', 3, h.context());
    expect(result.items.map((i) => i.value)).toContain('touch');
  });

  it('completes file paths', () => {
    const h = harness();
    const result = h.shell.complete('cat READ', 8, h.context());
    expect(result.items.map((i) => i.value)).toContain('README.txt');
  });
});
