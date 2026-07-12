import { exampleById } from '@novaos/examples';
import type { Tutorial, TutorialStep, TutorialFeature, Checkpoint } from './types';
import { expectedOutput, hasDiagnostic } from './checkpoints';

interface StepOpts {
  readonly title: string;
  readonly explanation: string;
  readonly feature: TutorialFeature;
  readonly checkpoints: readonly Checkpoint[];
  readonly hints?: readonly string[];
}

/** A step whose program is drawn from `@novaos/examples` (source stays in lockstep). */
function exampleStep(exampleId: string, opts: StepOpts): TutorialStep {
  const ex = exampleById(exampleId);
  if (!ex) throw new Error(`Tutorial references unknown example "${exampleId}".`);
  return {
    id: exampleId,
    title: opts.title,
    explanation: opts.explanation,
    starterProgram: {
      language: ex.language,
      fileName: ex.fileName,
      source: ex.source,
      exampleId,
    },
    feature: opts.feature,
    checkpoints: opts.checkpoints,
    ...(opts.hints ? { hints: opts.hints } : {}),
  };
}

/** A step with an inline program (no matching gallery example). */
function inlineStep(id: string, fileName: string, source: string, opts: StepOpts): TutorialStep {
  return {
    id,
    title: opts.title,
    explanation: opts.explanation,
    starterProgram: { language: 'toy-c', fileName, source },
    feature: opts.feature,
    checkpoints: opts.checkpoints,
    ...(opts.hints ? { hints: opts.hints } : {}),
  };
}

const HEAP_SOURCE = `int main() {
  int p = malloc(8);
  poke(p, 42);
  poke(p + 4, 8);
  print(peek(p) + peek(p + 4));
  free(p);
  return 0;
}
`;

const ARRAY_SOURCE = `int main() {
  int a[3];
  a[0] = 5;
  a[1] = 10;
  a[2] = a[0] + a[1];
  print(a[2]);
  return 0;
}
`;

const BITWISE_SOURCE = `int main() {
  print(1 | 2 & 2);
  return 0;
}
`;

const TYPE_ERROR_SOURCE = `int main() {
  int x = true;
  return 0;
}
`;

export const TUTORIALS: readonly Tutorial[] = [
  {
    id: 'compiler-pipeline',
    title: 'From source to silicon',
    summary: 'Compile small Toy C programs and watch them run on the NovaVM.',
    estimatedMinutes: 8,
    steps: [
      exampleStep('hello', {
        title: 'Your first program',
        explanation:
          'Declare two variables, add them, and print the result. Load this into the editor and run it — the VM should print 15.',
        feature: 'compiler',
        checkpoints: [expectedOutput('hello-out', 'Prints 15', '15')],
      }),
      exampleStep('arithmetic', {
        title: 'Operator precedence',
        explanation:
          'Multiplication binds tighter than addition, so 2 + 3 * 4 is 14, not 20. The parser encodes this precedence.',
        feature: 'compiler',
        checkpoints: [expectedOutput('arith-out', 'Prints 14', '14')],
        hints: ['Try changing it to (2 + 3) * 4 and re-running.'],
      }),
      exampleStep('branch', {
        title: 'Branches and function calls',
        explanation:
          'A max() function with if/else, called from main. Control flow becomes a branch in the generated IR.',
        feature: 'compiler',
        checkpoints: [expectedOutput('branch-out', 'max(3, 7) prints 7', '7')],
      }),
      inlineStep('type-error', 'type-error.c', TYPE_ERROR_SOURCE, {
        title: 'A deliberate type error',
        explanation:
          'Assigning a bool to an int is a type error. Compiling this should surface a diagnostic instead of bytecode.',
        feature: 'compiler',
        checkpoints: [hasDiagnostic('type-error-diag', 'Reports a type error', 'error')],
      }),
    ],
  },
  {
    id: 'loops-and-recursion',
    title: 'Loops and recursion',
    summary: 'Iterate with while loops and recurse through the call stack.',
    estimatedMinutes: 6,
    steps: [
      exampleStep('loop', {
        title: 'Summing with a while loop',
        explanation: 'Add the integers 1..10 with a while loop. The result is 55.',
        feature: 'compiler',
        checkpoints: [expectedOutput('loop-out', 'Sum 1..10 = 55', '55')],
      }),
      exampleStep('fibonacci', {
        title: 'Recursion and the call stack',
        explanation:
          'Recursive Fibonacci exercises the calling convention: each call pushes a frame. fib(10) = 55. Open the Debugger in the workspace to step into the recursion.',
        feature: 'debugger',
        checkpoints: [expectedOutput('fib-out', 'fib(10) = 55', '55')],
        hints: ['In the workspace, press Debug then Step into to descend into fib().'],
      }),
    ],
  },
  {
    id: 'dynamic-memory',
    title: 'malloc and the heap',
    summary: 'Allocate memory on the heap, write through pointers, and free it.',
    estimatedMinutes: 5,
    steps: [
      inlineStep('heap-basics', 'heap.c', HEAP_SOURCE, {
        title: 'Allocate, poke, peek, free',
        explanation:
          'malloc reserves 8 bytes; poke/peek write and read words through the pointer. 42 + 8 = 50. Open the Heap view in the workspace debugger to watch the block.',
        feature: 'heap',
        checkpoints: [expectedOutput('heap-out', 'Prints 50', '50')],
      }),
    ],
  },
  {
    id: 'language-features',
    title: 'Arrays and bit twiddling',
    summary: 'Fixed-size arrays and the bitwise operators.',
    estimatedMinutes: 5,
    steps: [
      inlineStep('arrays', 'array.c', ARRAY_SOURCE, {
        title: 'Fixed-size arrays',
        explanation:
          'Declare int a[3], fill it, and sum two elements into a third. Indexing lowers to address arithmetic in codegen.',
        feature: 'compiler',
        checkpoints: [expectedOutput('array-out', 'a[2] = a[0] + a[1] = 15', '15')],
      }),
      inlineStep('bitwise', 'bitwise.c', BITWISE_SOURCE, {
        title: 'Bitwise precedence',
        explanation: 'AND binds tighter than OR, so 1 | 2 & 2 is 1 | (2 & 2) = 1 | 2 = 3.',
        feature: 'compiler',
        checkpoints: [expectedOutput('bitwise-out', 'Prints 3', '3')],
      }),
    ],
  },
];

export function tutorialById(id: string): Tutorial | undefined {
  return TUTORIALS.find((t) => t.id === id);
}

export function stepById(tutorialId: string, stepId: string): TutorialStep | undefined {
  return tutorialById(tutorialId)?.steps.find((s) => s.id === stepId);
}
