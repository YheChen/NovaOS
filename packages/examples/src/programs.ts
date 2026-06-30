/**
 * Curated example programs for the NovaOS workspace and tutorials. Each example
 * is real source consumed by the compiler/assembler; `expectedOutput` is what
 * the program prints when run on the VM (verified by tests).
 */
export interface ExampleProgram {
  readonly id: string;
  readonly title: string;
  readonly language: 'toy-c' | 'assembly';
  readonly fileName: string;
  readonly description: string;
  readonly source: string;
  readonly expectedOutput: string;
}

export const EXAMPLES: readonly ExampleProgram[] = [
  {
    id: 'hello',
    title: 'Hello, addition',
    language: 'toy-c',
    fileName: 'hello.c',
    description: 'Declare variables, add them, and print the result.',
    source: `int main() {
  int a = 5;
  int b = 10;
  int c = a + b;
  print(c);
  return 0;
}
`,
    expectedOutput: '15',
  },
  {
    id: 'arithmetic',
    title: 'Operator precedence',
    language: 'toy-c',
    fileName: 'arithmetic.c',
    description: 'Multiplication binds tighter than addition: 2 + 3 * 4 = 14.',
    source: `int main() {
  print(2 + 3 * 4);
  return 0;
}
`,
    expectedOutput: '14',
  },
  {
    id: 'loop',
    title: 'While loop',
    language: 'toy-c',
    fileName: 'loop.c',
    description: 'Sum the integers 1..10 with a while loop.',
    source: `int main() {
  int i = 1;
  int sum = 0;
  while (i <= 10) {
    sum = sum + i;
    i = i + 1;
  }
  print(sum);
  return 0;
}
`,
    expectedOutput: '55',
  },
  {
    id: 'branch',
    title: 'If / else (max)',
    language: 'toy-c',
    fileName: 'max.c',
    description: 'Return the larger of two numbers with if/else and a function call.',
    source: `int max(int a, int b) {
  if (a > b) {
    return a;
  }
  return b;
}
int main() {
  print(max(3, 7));
  return 0;
}
`,
    expectedOutput: '7',
  },
  {
    id: 'fibonacci',
    title: 'Recursion (Fibonacci)',
    language: 'toy-c',
    fileName: 'fib.c',
    description: 'Recursive Fibonacci — exercises the call stack: fib(10) = 55.',
    source: `int fib(int n) {
  if (n < 2) {
    return n;
  }
  return fib(n - 1) + fib(n - 2);
}
int main() {
  print(fib(10));
  return 0;
}
`,
    expectedOutput: '55',
  },
  {
    id: 'asm-hello',
    title: 'NovaASM by hand',
    language: 'assembly',
    fileName: 'hello.asm',
    description: 'The same 5 + 10 in raw NovaASM, printed via the print syscall.',
    source: `.global main

main:
  MOV R0, 5
  MOV R1, 10
  ADD R0, R0, R1
  SYSCALL 0
  HALT
`,
    expectedOutput: '15',
  },
];

export function exampleById(id: string): ExampleProgram | undefined {
  return EXAMPLES.find((e) => e.id === id);
}
