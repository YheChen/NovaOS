import { describe, it, expect } from 'vitest';
import { createSeededRandom } from '@novaos/shared';
import { compileToyC, type CompilationResult, type ProgramNode } from '@novaos/compiler';
import { createNovaRuntime } from '../runtime';
import { generateProgram } from './generator';
import { interpret, InterpreterTrap } from './interpreter';

/**
 * Seeds to explore. Each one is an independent, reproducible program, so the
 * default range is a fixed corpus that gates every CI run in a few seconds.
 * Widen it to go hunting:
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
 * The step cap both sides run under. A generated program with three levels of
 * nested loops can outlast it, and a truncated run is not comparable to a
 * complete one - its output is only a prefix of the real output - so those
 * seeds are skipped rather than reported as disagreements.
 */
const MAX_STEPS = 2_000_000;

/**
 * The v1 code generator sizes a frame by how many temporaries are live at
 * once, but a function can still outgrow the 32-slot frame. That is a known
 * limitation rather than a defect, so those programs are skipped - though only
 * a handful should be, otherwise the generator is producing programs too large
 * to test anything.
 */
const SLOT_LIMIT = /needs \d+ stack slots/;

interface Execution {
  readonly output: string;
  readonly completed: boolean;
}

function run(result: CompilationResult): Execution {
  const bytecode = result.bytecode;
  if (!bytecode) throw new Error('compilation produced no bytecode');
  const runtime = createNovaRuntime({
    scheduler: 'round-robin',
    quantumTicks: 64,
    maxSteps: MAX_STEPS,
  });
  runtime.boot();
  runtime.spawn('fuzz', { entryPoint: bytecode.entryPoint, code: bytecode.code });
  const outcome = runtime.run();
  return { output: runtime.getOutput(), completed: outcome.steps < MAX_STEPS };
}

/** Interpret, or report that the program outlasted the interpreter's budget. */
function reference(ast: ProgramNode): Execution {
  try {
    return { output: interpret(ast, MAX_STEPS).output, completed: true };
  } catch (error) {
    if (error instanceof InterpreterTrap && error.code === 'interpreter/step-budget') {
      return { output: '', completed: false };
    }
    throw error;
  }
}

function errorsOf(result: CompilationResult): string {
  return result.diagnostics
    .filter((d) => d.severity === 'error')
    .map((d) => d.message)
    .join('; ');
}

/** Keep a failure message readable when the program printed thousands of lines. */
const excerpt = (text: string): string => JSON.stringify(text.slice(0, 400));

describe('Toy C differential fuzzing', () => {
  it(
    `agrees with the reference interpreter across ${SEED_COUNT} generated programs`,
    () => {
      let skipped = 0;
      let tooLong = 0;
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

        const expected = reference(ast);
        const actual = run(compiled);

        if (!expected.completed || !actual.completed) {
          tooLong += 1;
          continue;
        }

        if (actual.output !== expected.output) {
          throw new Error(
            `seed ${seed}: the VM and the reference interpreter disagree.\n` +
              `interpreter: ${excerpt(expected.output)}\n` +
              `vm:          ${excerpt(actual.output)}\n\n${source}`,
          );
        }

        compared += 1;
        printedLines += expected.output === '' ? 0 : expected.output.trimEnd().split('\n').length;
      }

      // Guard against the suite quietly degrading into a no-op.
      expect(compared).toBeGreaterThan(SEED_COUNT * 0.7);
      expect(printedLines).toBeGreaterThan(compared);
      expect(skipped).toBeLessThan(SEED_COUNT * 0.2);
      expect(tooLong).toBeLessThan(SEED_COUNT * 0.1);
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

        // Optimized code executes fewer instructions, so a program near the
        // step cap can complete one way and be truncated the other. Only
        // compare runs that both reached the end.
        if (!withPasses.completed || !withoutPasses.completed) continue;

        if (withPasses.output !== withoutPasses.output) {
          throw new Error(
            `seed ${seed}: optimization changed the program's behaviour.\n` +
              `optimized:   ${excerpt(withPasses.output)}\n` +
              `unoptimized: ${excerpt(withoutPasses.output)}\n\n${source}`,
          );
        }

        compared += 1;
      }

      expect(compared).toBeGreaterThan(SEED_COUNT * 0.7);
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
