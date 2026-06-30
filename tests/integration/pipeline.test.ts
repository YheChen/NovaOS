import { describe, it, expect } from 'vitest';
import { createSimulationClock } from '@novaos/shared';
import { compileToyC } from '@novaos/compiler';
import { createNovaRuntime, createProgramRunner } from '@novaos/simulator';
import { createDebugger, type DebugProgram } from '@novaos/debugger';
import { createFileSystem } from '@novaos/filesystem';
import { createShell } from '@novaos/shell';
import { createTerminalSession } from '@novaos/terminal';

/**
 * Cross-package integration: each test exercises several packages together
 * through their public contracts only.
 */
describe('compiler + assembler + VM', () => {
  it('compiles Toy C and runs the bytecode on the kernel-driven runtime', () => {
    const compiled = compileToyC(
      'int main() { int a = 5; int b = 10; int c = a + b; print(c); return 0; }',
      { fileName: 'sum.c' },
    );
    expect(compiled.success).toBe(true);
    const rt = createNovaRuntime({ scheduler: 'round-robin', quantumTicks: 8 });
    rt.boot();
    rt.spawn('sum', { entryPoint: compiled.bytecode!.entryPoint, code: compiled.bytecode!.code });
    rt.run();
    expect(rt.getOutput().trim()).toBe('15');
  });
});

describe('debugger + VM + source maps', () => {
  it('resolves a line breakpoint through the compiler source map and pauses there', () => {
    const compiled = compileToyC(
      `int main() {
  int x = 41;
  x = x + 1;
  print(x);
  return 0;
}`,
      { fileName: 'd.c' },
    );
    const program: DebugProgram = {
      bytecode: compiled.bytecode!,
      lineMap: compiled
        .sourceMap!.entries.filter((e) => e.sourceLine !== null)
        .map((e) => ({ address: e.bytecodeAddress, line: e.sourceLine as number })),
    };
    const dbg = createDebugger(program);
    dbg.addLineBreakpoint(4); // print(x);
    const snap = dbg.continueExecution();
    expect(snap.state).toBe('paused');
    expect(snap.currentLocation?.sourceLine).toBe(4);
    expect(snap.output.trim()).toBe(''); // not printed yet
    expect(dbg.continueExecution().output.trim()).toBe('42');
  });
});

describe('filesystem + shell + terminal', () => {
  it('runs a sequence of shell commands against the virtual filesystem', () => {
    const clock = createSimulationClock();
    const session = createTerminalSession({
      shell: createShell(),
      filesystem: createFileSystem({ clock }),
      clock,
      runner: createProgramRunner(),
    });
    const exec = (line: string) => {
      session.setInput(line);
      return session.submit();
    };

    expect(exec('pwd').output.map((l) => l.text)).toEqual(['/home/student']);
    expect(exec('echo hello world').output.map((l) => l.text)).toEqual(['hello world']);
    expect(exec('mkdir demos').exitCode).toBe(0);
    const ls = exec('ls')
      .output.map((l) => l.text)
      .join(' ');
    expect(ls).toContain('demos');
    expect(ls).toContain('hello.c');
  });

  it('compiles and runs a seeded program end-to-end from the terminal', () => {
    const clock = createSimulationClock();
    const session = createTerminalSession({
      shell: createShell(),
      filesystem: createFileSystem({ clock }),
      clock,
      runner: createProgramRunner(),
    });
    session.setInput('run hello.c');
    const result = session.submit();
    expect(result.exitCode).toBe(0);
    expect(result.output.some((l) => l.kind === 'stdout' && l.text === '15')).toBe(true);
  });
});
