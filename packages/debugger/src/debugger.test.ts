import { describe, it, expect } from 'vitest';
import { createRegisterFile } from '@novaos/cpu';
import { compileToyC } from '@novaos/compiler';
import { evaluateExpression } from './watch';
import { createDebugger } from './controller';
import type { DebugProgram } from './types';

function programFrom(src: string): DebugProgram {
  const r = compileToyC(src, { fileName: 'p.c' });
  if (!r.success || !r.bytecode || !r.sourceMap) {
    throw new Error(`compile failed: ${r.diagnostics.map((d) => d.message).join('; ')}`);
  }
  const lineMap = r.sourceMap.entries
    .filter((e) => e.sourceLine !== null)
    .map((e) => ({ address: e.bytecodeAddress, line: e.sourceLine as number }));
  return { bytecode: r.bytecode, lineMap };
}

describe('watch expression evaluator (no eval)', () => {
  const regs = (() => {
    const rf = createRegisterFile();
    rf.set('r0', 5);
    rf.set('r1', 10);
    rf.set('sp', 0x1000);
    return rf.snapshot();
  })();
  const ctx = { registers: regs, readWord: (addr: number) => (addr === 0x1000 ? 42 : null) };

  it('reads registers and does arithmetic', () => {
    expect(evaluateExpression('R0 + R1 * 2', ctx)).toEqual({ ok: true, value: 25 });
  });
  it('reads memory', () => {
    expect(evaluateExpression('mem[SP]', ctx)).toEqual({ ok: true, value: 42 });
  });
  it('evaluates comparisons to 0/1', () => {
    expect(evaluateExpression('R0 < R1', ctx)).toEqual({ ok: true, value: 1 });
    expect(evaluateExpression('R0 == 10', ctx)).toEqual({ ok: true, value: 0 });
  });
  it('reports errors instead of throwing', () => {
    expect(evaluateExpression('foo + 1', ctx).ok).toBe(false);
    expect(evaluateExpression('1 / 0', ctx).ok).toBe(false);
    expect(evaluateExpression('mem[999]', ctx).ok).toBe(false);
  });
});

const LINEAR = `int main() {
  int x = 0;
  x = 7;
  print(x);
  return 0;
}
`;

describe('debugger run control + breakpoints', () => {
  it('loads paused at entry and runs to completion', () => {
    const dbg = createDebugger(programFrom(LINEAR));
    expect(dbg.getState()).toBe('loaded');
    const snap = dbg.continueExecution();
    expect(snap.state).toBe('terminated');
    expect(snap.output.trim()).toBe('7');
  });

  it('single-steps instruction by instruction', () => {
    const dbg = createDebugger(programFrom(LINEAR));
    dbg.stepInstruction();
    expect(dbg.getSnapshot().timeline.cursor).toBe(1);
    dbg.stepInstruction();
    expect(dbg.getSnapshot().timeline.cursor).toBe(2);
  });

  it('stops at a line breakpoint before executing that line', () => {
    const dbg = createDebugger(programFrom(LINEAR));
    dbg.addLineBreakpoint(4); // print(x);
    const snap = dbg.continueExecution();
    expect(snap.state).toBe('paused');
    expect(snap.pauseReason).toBe('breakpoint');
    expect(snap.currentLocation?.sourceLine).toBe(4);
    expect(snap.output.trim()).toBe(''); // print not executed yet
    const done = dbg.continueExecution();
    expect(done.output.trim()).toBe('7');
  });

  it('supports an instruction breakpoint at an address', () => {
    const dbg = createDebugger(programFrom(LINEAR));
    const addr = dbg.addressesForLine(4)[0] as number;
    dbg.addInstructionBreakpoint(addr);
    const snap = dbg.continueExecution();
    expect(snap.currentLocation?.address).toBe(addr);
  });

  it('supports a conditional breakpoint', () => {
    // pause at the print line only when SP is below the initial top (always true here)
    const dbg = createDebugger(programFrom(LINEAR));
    dbg.addConditionalBreakpoint(4, 'SP < 100000');
    const snap = dbg.continueExecution();
    expect(snap.state).toBe('paused');
    expect(snap.currentLocation?.sourceLine).toBe(4);
  });

  it('pauses with an exception reason on a fault (divide by zero)', () => {
    const dbg = createDebugger(
      programFrom('int main() { int a = 1; int z = a / 0; print(z); return 0; }'),
    );
    dbg.addExceptionBreakpoint();
    const snap = dbg.continueExecution();
    expect(snap.pauseReason).toBe('exception');
  });

  it('keeps watches available and numeric while paused', () => {
    const dbg = createDebugger(programFrom(LINEAR));
    dbg.addWatch('SP');
    dbg.addWatch('BP - SP');
    dbg.addLineBreakpoint(4);
    const snap = dbg.continueExecution();
    expect(snap.watches.every((w) => w.available)).toBe(true);
  });
});

const CALLS = `int add(int a, int b) {
  return a + b;
}
int main() {
  int x = add(2, 3);
  print(x);
  return 0;
}
`;

describe('stepping into/over and call stack', () => {
  it('step into enters the callee; step over does not', () => {
    const into = createDebugger(programFrom(CALLS));
    const intoBp = into.addLineBreakpoint(5); // int x = add(2, 3);
    into.continueExecution();
    into.removeBreakpoint(intoBp); // positioned; now step purely
    const afterInto = into.stepInto();
    expect(afterInto.callStack.some((f) => f.functionName === 'add')).toBe(true);

    const over = createDebugger(programFrom(CALLS));
    const overBp = over.addLineBreakpoint(5);
    over.continueExecution();
    over.removeBreakpoint(overBp);
    const afterOver = over.stepLine();
    expect(afterOver.currentLocation?.sourceLine).toBe(6); // moved past the call
    expect(afterOver.callStack.some((f) => f.functionName === 'add')).toBe(false);
  });

  it('reconstructs a recursive call stack', () => {
    const FACT = `int fact(int n) {
  if (n <= 1) {
    return 1;
  }
  return n * fact(n - 1);
}
int main() {
  print(fact(5));
  return 0;
}
`;
    const dbg = createDebugger(programFrom(FACT));
    dbg.addLineBreakpoint(3); // return 1; (base case)
    const snap = dbg.continueExecution();
    const factFrames = snap.callStack.filter((f) => f.functionName === 'fact').length;
    expect(factFrames).toBeGreaterThanOrEqual(4);
    expect(snap.callStack.some((f) => f.functionName === 'main')).toBe(true);
  });
});

describe('time-travel replay', () => {
  it('rewinds and jumps deterministically', () => {
    const dbg = createDebugger(programFrom(LINEAR));
    const end = dbg.continueExecution();
    expect(end.output.trim()).toBe('7');
    const total = end.timeline.cursor;

    const back = dbg.stepBack();
    expect(back.timeline.cursor).toBe(total - 1);

    const start = dbg.jumpToStep(0);
    expect(start.timeline.cursor).toBe(0);
    expect(start.output.trim()).toBe('');

    // replay forward from the start is identical
    const replay = dbg.continueExecution();
    expect(replay.output.trim()).toBe('7');
  });

  it('reports a total step count that matches the terminated cursor', () => {
    const dbg = createDebugger(programFrom(LINEAR));
    const total = dbg.getTotalSteps();
    expect(total).toBeGreaterThan(0);
    expect(dbg.continueExecution().timeline.cursor).toBe(total);
  });

  it('is deterministic across two independent sessions', () => {
    const a = createDebugger(programFrom(LINEAR)).continueExecution();
    const b = createDebugger(programFrom(LINEAR)).continueExecution();
    expect(a.timeline.cursor).toBe(b.timeline.cursor);
    expect(a.output).toBe(b.output);
  });
});
