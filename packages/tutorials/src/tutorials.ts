import { exampleById } from '@novaos/examples';
import type {
  Tutorial,
  TutorialStep,
  TutorialFeature,
  Checkpoint,
  MmuCheckpointConfig,
} from './types';
import { expectedOutput, hasDiagnostic, mmuTranslate } from './checkpoints';

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

/** A step with no editor program (e.g. a virtual-memory walkthrough). */
function conceptStep(id: string, opts: StepOpts): TutorialStep {
  return {
    id,
    title: opts.title,
    explanation: opts.explanation,
    feature: opts.feature,
    checkpoints: opts.checkpoints,
    ...(opts.hints ? { hints: opts.hints } : {}),
  };
}

// A small paging geometry: 16-byte pages, 16 virtual pages, 4 physical frames.
const VM_CONFIG: MmuCheckpointConfig = {
  pageSizeBytes: 16,
  virtualAddressBits: 8,
  physicalAddressBits: 6,
  replacementId: 'fifo',
  seed: 1,
};

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
  {
    id: 'virtual-memory',
    title: 'Virtual memory and paging',
    summary: 'Translate virtual addresses, demand-page on a miss, and evict under pressure.',
    estimatedMinutes: 7,
    steps: [
      conceptStep('vm-translate', {
        title: 'Decode and translate an address',
        explanation:
          'With 16-byte pages, virtual address 0x1A splits into VPN 1 (0x1A >> 4) and offset 10 (0x1A & 0xF). VPN 1 is not resident, so the first access demand-pages it into frame 0, giving physical address 0*16 + 10 = 10. A second access hits the same mapping. Open the Paging lab to watch the walk step by step.',
        feature: 'memory',
        checkpoints: [
          mmuTranslate('vm-translate-cp', 'VA 0x1A → PA 10, stable across accesses', VM_CONFIG, [
            { address: 0x1a, kind: 'read', expectPhysical: 10 },
            { address: 0x1a, kind: 'read', expectPhysical: 10 },
          ]),
        ],
        hints: ['offset bits = log2(pageSize) = 4, so the low 4 bits are the offset.'],
      }),
      conceptStep('vm-evict', {
        title: 'Fill the frames and evict (FIFO)',
        explanation:
          'There are only 4 physical frames. Touching VPNs 0..3 fills them (frames 0..3). Touching VPN 4 finds memory full, so FIFO evicts the oldest page (VPN 0, frame 0) and reuses frame 0. Re-touching VPN 0 now faults again and evicts the next-oldest (VPN 1, frame 1).',
        feature: 'memory',
        checkpoints: [
          mmuTranslate('vm-evict-cp', 'FIFO reuses the oldest frame under pressure', VM_CONFIG, [
            { address: 0, kind: 'read', expectPhysical: 0 },
            { address: 16, kind: 'read', expectPhysical: 16 },
            { address: 32, kind: 'read', expectPhysical: 32 },
            { address: 48, kind: 'read', expectPhysical: 48 },
            { address: 64, kind: 'read', expectPhysical: 0 }, // VPN 4 evicts VPN 0 → frame 0
            { address: 0, kind: 'read', expectPhysical: 16 }, // VPN 0 re-faults → frame 1
          ]),
        ],
      }),
      conceptStep('vm-range', {
        title: 'Addresses out of range fault',
        explanation:
          'The virtual address space is 8 bits wide (256 bytes). A virtual address of 300 lies outside it, so translation fails with an out-of-range fault rather than reading garbage.',
        feature: 'memory',
        checkpoints: [
          mmuTranslate('vm-range-cp', 'VA 300 is rejected as out of range', VM_CONFIG, [
            { address: 300, kind: 'read', expectFault: true },
          ]),
        ],
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
