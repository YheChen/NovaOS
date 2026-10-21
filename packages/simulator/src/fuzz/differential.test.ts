import { describe, it, expect } from 'vitest';
import { createSeededRandom } from '@novaos/shared';
import { compileToyC, type CompilationResult } from '@novaos/compiler';
import { createNovaRuntime } from '../runtime';
import { generateProgram } from './generator';
import { interpret } from './interpreter';

/**
 * Seeds to explore. Each one is an independent, reproducible program, so the
 * default range is a fixed corpus that gates every CI run in about a second
 * per pass. Widen it to go hunting:
 *
 *   NOVAOS_FUZZ_SEEDS=20000 pnpm exec vitest run packages/simulator/src/fuzz
 *   NOVAOS_FUZZ_START=20001 NOVAOS_FUZZ_SEEDS=20000 ...
 *
 * A failure reports its seed and the full program it generated, so any find
 * reproduces exactly by pinning the range to that one seed.
 */
const FIRST_SEED = Number(process.env['NOVAOS_FUZZ_START'] ?? 1);
const SEED_COUNT = Number(process.env['NOVAOS_FUZZ_SEEDS'] ?? 300);
const LAST_SEED = FIRST_SEED + SEED_COUNT - 1;

/** Scales with the range so a widened run is not cut short by the default timeout. */
const TIMEOUT_MS = Math.max(60_000, SEED_COUNT * 80);

/**
 * The v1 code generator never reuses a stack slot, so a large enough function
 * exhausts the 32-slot frame. That is a known limitation rather than a defect,
 * so those programs are skipped - but only a handful should be, otherwise the
 * generator is producing programs too big to test anything.
 */
const SLOT_LIMIT = /needs \d+ stack slots/;

function run(result: CompilationResult): string {
  const bytecode = result.bytecode;
  if (!bytecode) throw new Error('compilation produced no bytecode');
  const runtime = createNovaRuntime({ scheduler: 'round-robin', quantumTicks: 64 });
  runtime.boot();
  runtime.spawn('fuzz', { entryPoint: bytecode.entryPoint, code: bytecode.code });
  runtime.run();
  return runtime.getOutput();
}

function errorsOf(result: CompilationResult): string {
  return result.diagnostics
    .filter((d) => d.severity === 'error')
    .map((d) => d.message)
    .join('; ');
}

describe('Toy C differential fuzzing', () => {
  it(
    `agrees with the reference interpreter across ${SEED_COUNT} generated programs`,
    () => {
      let skipped = 0;
      let compared = 0;
      let printedLines = 0;

      for (let seed = FIRST_SEED; seed <= LAST_SEED; seed += 1) {
        const source = generateProgram(createSeededRandom(seed));
        const compiled = compileToyC(source, { fileName: `fuzz-${seed}.c` });

        if (!compiled.success) {
          const errors = errorsOf(compiled);
          if (SLOT_LIMIT.test(errors)) {
            skipped += 1;
            continue;
          }
          throw new Error(`seed ${seed} failed to compile: ${errors}\n\n${source}`);
        }

        const ast = compiled.ast;
        if (!ast) throw new Error(`seed ${seed} compiled without an AST`);

        const expected = interpret(ast).output;
        const actual = run(compiled);

        if (actual !== expected) {
          throw new Error(
            `seed ${seed}: the VM and the reference interpreter disagree.\n` +
              `interpreter: ${JSON.stringify(expected)}\n` +
              `vm:          ${JSON.stringify(actual)}\n\n${source}`,
          );
        }

        compared += 1;
        printedLines += expected === '' ? 0 : expected.trimEnd().split('\n').length;
      }

      // Guard against the suite quietly degrading into a no-op.
      expect(compared).toBeGreaterThan(SEED_COUNT * 0.8);
      expect(printedLines).toBeGreaterThan(compared);
      expect(skipped).toBeLessThan(SEED_COUNT * 0.2);
    },
    TIMEOUT_MS,
  );

  it(
    'produces identical output with every optimization pass disabled',
    () => {
      let compared = 0;

      for (let seed = FIRST_SEED; seed <= LAST_SEED; seed += 1) {
        const source = generateProgram(createSeededRandom(seed));
        const fileName = `fuzz-${seed}.c`;
        const optimized = compileToyC(source, { fileName });
        const unoptimized = compileToyC(source, {
          fileName,
          optimize: {
            constantFolding: false,
            copyPropagation: false,
            deadCodeElimination: false,
          },
        });

        if (!optimized.success || !unoptimized.success) continue;

        const withPasses = run(optimized);
        const withoutPasses = run(unoptimized);

        if (withPasses !== withoutPasses) {
          throw new Error(
            `seed ${seed}: optimization changed the program's behaviour.\n` +
              `optimized:   ${JSON.stringify(withPasses)}\n` +
              `unoptimized: ${JSON.stringify(withoutPasses)}\n\n${source}`,
          );
        }

        compared += 1;
      }

      expect(compared).toBeGreaterThan(SEED_COUNT * 0.8);
    },
    TIMEOUT_MS,
  );

  it('generates the same program for the same seed', () => {
    const a = generateProgram(createSeededRandom(42));
    const b = generateProgram(createSeededRandom(42));
    expect(a).toBe(b);
    expect(a).not.toBe(generateProgram(createSeededRandom(43)));
  });
});
