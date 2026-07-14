import { describe, it, expect } from 'vitest';
import { createProgramRunner } from '@novaos/simulator';
import { exampleById } from '@novaos/examples';
import {
  TUTORIALS,
  tutorialById,
  stepById,
  verifyCheckpoint,
  expectedOutput,
  mmuTranslate,
} from './index';

const runner = createProgramRunner();

describe('tutorial dataset — structural integrity', () => {
  it('ships tutorials with unique ids', () => {
    expect(TUTORIALS.length).toBeGreaterThan(0);
    expect(new Set(TUTORIALS.map((t) => t.id)).size).toBe(TUTORIALS.length);
  });

  it('has unique step ids and checkpoint ids within each tutorial/step', () => {
    for (const t of TUTORIALS) {
      const stepIds = t.steps.map((s) => s.id);
      expect(new Set(stepIds).size).toBe(stepIds.length);
      for (const s of t.steps) {
        const cpIds = s.checkpoints.map((c) => c.id);
        expect(new Set(cpIds).size).toBe(cpIds.length);
      }
    }
  });

  it('references only known examples, with matching source', () => {
    for (const t of TUTORIALS) {
      for (const s of t.steps) {
        const program = s.starterProgram;
        if (!program || program.exampleId === undefined) continue;
        const ex = exampleById(program.exampleId);
        expect(ex, `example ${program.exampleId}`).toBeDefined();
        expect(program.source).toBe(ex?.source);
      }
    }
  });
});

describe('tutorial dataset — semantic integrity (the oracle)', () => {
  it('every checkpoint passes against the real runner / MMU', () => {
    for (const t of TUTORIALS) {
      for (const s of t.steps) {
        for (const cp of s.checkpoints) {
          const result = verifyCheckpoint(cp, {
            runner,
            fileName: s.starterProgram?.fileName,
            source: s.starterProgram?.source,
          });
          expect(result.passed, `${t.id}/${s.id}/${cp.id}: ${result.detail}`).toBe(true);
        }
      }
    }
  });
});

describe('lookups + verifier correctness', () => {
  it('resolves tutorials and steps by id', () => {
    const first = TUTORIALS[0];
    expect(first).toBeDefined();
    if (!first) return;
    expect(tutorialById(first.id)).toBe(first);
    expect(tutorialById('nope')).toBeUndefined();
    const firstStep = first.steps[0];
    if (firstStep) expect(stepById(first.id, firstStep.id)).toBe(firstStep);
  });

  it('fails a wrong expected-output with a useful detail', () => {
    const hello = exampleById('hello');
    expect(hello).toBeDefined();
    if (!hello) return;
    const result = verifyCheckpoint(expectedOutput('x', 'wrong', '999'), {
      runner,
      fileName: hello.fileName,
      source: hello.source,
    });
    expect(result.passed).toBe(false);
    expect(result.detail).toContain('expected');
  });

  it('verifies mmu-translate checkpoints (pass and fail)', () => {
    const cfg = {
      pageSizeBytes: 16,
      virtualAddressBits: 8,
      physicalAddressBits: 6,
      replacementId: 'fifo' as const,
      seed: 1,
    };
    const good = verifyCheckpoint(
      mmuTranslate('g', 'ok', cfg, [{ address: 0x1a, kind: 'read', expectPhysical: 10 }]),
      { runner },
    );
    expect(good.passed).toBe(true);
    const bad = verifyCheckpoint(
      mmuTranslate('b', 'wrong', cfg, [{ address: 0x1a, kind: 'read', expectPhysical: 999 }]),
      { runner },
    );
    expect(bad.passed).toBe(false);
  });
});
