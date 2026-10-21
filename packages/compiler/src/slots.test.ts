import { describe, it, expect } from 'vitest';
import type { SourceSpan } from '@novaos/shared';
import { allocateTempSlots } from './slots';
import { compileToyC } from './compile';
import { INT } from './types';
import type { IRBasicBlock, IRFunction, IRInstruction, IRTerminator } from './ir';

const span: SourceSpan = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

const konst = (target: number, value = 1): IRInstruction => ({
  kind: 'const',
  target,
  value,
  span,
});
const add = (target: number, left: number, right: number): IRInstruction => ({
  kind: 'binary',
  op: '+',
  target,
  left,
  right,
  span,
});
const ret = (value: number | null): IRTerminator => ({ kind: 'return', value, span });

const block = (
  id: number,
  instructions: IRInstruction[],
  terminator: IRTerminator,
): IRBasicBlock => ({ id, label: `bb${id}`, instructions, terminator });

const fn = (blocks: IRBasicBlock[], tempCount: number): IRFunction => ({
  name: 'f',
  returnType: INT,
  locals: [],
  paramCount: 0,
  tempCount,
  blocks,
  sourceSpan: span,
});

describe('allocateTempSlots', () => {
  it('gives simultaneously live temporaries different slots', () => {
    // t0 and t1 are both live when t2 is computed.
    const { slotOf, slotCount } = allocateTempSlots(
      fn([block(0, [konst(0), konst(1), add(2, 0, 1)], ret(2))], 3),
    );
    expect(slotOf[0]).not.toBe(slotOf[1]);
    expect(slotCount).toBe(2);
  });

  it('lets a result reuse the slot of an operand that dies with it', () => {
    // After `t2 = t0 + t1`, neither operand is live, so t2 may take either slot.
    const { slotOf } = allocateTempSlots(
      fn([block(0, [konst(0), konst(1), add(2, 0, 1)], ret(2))], 3),
    );
    expect([slotOf[0], slotOf[1]]).toContain(slotOf[2]);
  });

  it('reuses slots across independent expressions', () => {
    // Two unrelated three-temp expressions; the second reuses the first's slots.
    const { slotCount } = allocateTempSlots(
      fn(
        [block(0, [konst(0), konst(1), add(2, 0, 1), konst(3), konst(4), add(5, 3, 4)], ret(5))],
        6,
      ),
    );
    expect(slotCount).toBe(2);
  });

  it('keeps a temporary live across a back edge out of the loop body', () => {
    // t0 is defined before the loop and read after it, so the loop body must
    // not reuse its slot. This only holds if liveness reaches a fixpoint.
    const { slotOf } = allocateTempSlots(
      fn(
        [
          block(0, [konst(0)], { kind: 'jump', target: 1, span }),
          block(1, [konst(1), add(2, 0, 1)], {
            kind: 'branch',
            condition: 2,
            thenBlock: 1,
            elseBlock: 2,
            span,
          }),
          block(2, [], ret(0)),
        ],
        3,
      ),
    );
    expect(slotOf[0]).not.toBe(slotOf[1]);
    expect(slotOf[0]).not.toBe(slotOf[2]);
  });

  it('marks temporaries the function never references', () => {
    const { slotOf } = allocateTempSlots(fn([block(0, [konst(0)], ret(0))], 3));
    expect(slotOf[0]).toBeGreaterThanOrEqual(0);
    expect(slotOf[1]).toBe(-1);
    expect(slotOf[2]).toBe(-1);
  });

  it('is deterministic', () => {
    const build = (): IRFunction =>
      fn([block(0, [konst(0), konst(1), add(2, 0, 1), add(3, 2, 0)], ret(3))], 4);
    expect(allocateTempSlots(build())).toEqual(allocateTempSlots(build()));
  });
});

describe('frame sizing after slot reuse', () => {
  /** The prologue reserves `frameBytes`, so the LDI before SUB SP names it. */
  function frameBytesOf(asm: string, fnName: string): number {
    const body = asm.slice(asm.indexOf(`${fnName}:`));
    const match = /LDI R0, (\d+)\n\s*SUB SP, SP, R0/.exec(body);
    return match?.[1] ? Number(match[1]) : 0;
  }

  it('compiles a function whose temporaries would once have overflowed the frame', () => {
    // Fifteen chained expressions: more than 32 temporaries, but never more
    // than a handful of them live at once.
    const statements = Array.from(
      { length: 15 },
      (_, i) => `  x = ((x + ${i}) * (x - ${i})) ^ ((x | ${i}) & (x >> 1));`,
    ).join('\n');
    const source = `int main() {\n  int x = 3;\n${statements}\n  print(x);\n  return 0;\n}`;

    const result = compileToyC(source, { fileName: 'wide.c' });
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(result.success).toBe(true);

    const fnIr = result.optimizedIr?.functions.find((f) => f.name === 'main');
    expect(fnIr).toBeDefined();
    if (fnIr) {
      // Far more temporaries exist than slots are handed out for them.
      expect(fnIr.tempCount).toBeGreaterThan(32);
      expect(allocateTempSlots(fnIr).slotCount).toBeLessThan(12);
    }

    expect(frameBytesOf(result.assembly ?? '', 'main')).toBeLessThanOrEqual(32 * 4);
  });
});
