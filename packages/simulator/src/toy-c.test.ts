import { describe, it, expect } from 'vitest';
import { createProgramRunner } from './runner';

const runner = createProgramRunner();

function run(name: string, src: string): string {
  const report = runner.run(name, src);
  if (!report.ok) {
    throw new Error(`run failed: ${report.diagnostics.map((d) => d.message).join('; ')}`);
  }
  return report.output.trim();
}

describe('Toy C end-to-end (compile + run on the VM)', () => {
  it('acceptance: int a=5; int b=10; int c=a+b; print(c) => 15', () => {
    expect(
      run(
        'hello.c',
        `int main() {
  int a = 5;
  int b = 10;
  int c = a + b;
  print(c);
  return 0;
}`,
      ),
    ).toBe('15');
  });

  it('calls a function with arguments: add(5, 10) => 15', () => {
    expect(
      run(
        'add.c',
        `int add(int a, int b) {
  return a + b;
}
int main() {
  print(add(5, 10));
  return 0;
}`,
      ),
    ).toBe('15');
  });

  it('evaluates if/else', () => {
    expect(
      run(
        'branch.c',
        `int main() {
  int x = 7;
  if (x > 5) { print(1); } else { print(0); }
  return 0;
}`,
      ),
    ).toBe('1');
  });

  it('runs a while loop: sum 1..5 => 15', () => {
    expect(
      run(
        'loop.c',
        `int main() {
  int i = 1;
  int s = 0;
  while (i <= 5) {
    s = s + i;
    i = i + 1;
  }
  print(s);
  return 0;
}`,
      ),
    ).toBe('15');
  });

  it('supports recursion: fact(5) => 120', () => {
    expect(
      run(
        'fact.c',
        `int fact(int n) {
  if (n <= 1) { return 1; }
  return n * fact(n - 1);
}
int main() {
  print(fact(5));
  return 0;
}`,
      ),
    ).toBe('120');
  });

  it('exercises arithmetic and operator precedence: 2 + 3 * 4 => 14', () => {
    expect(run('arith.c', 'int main() { print(2 + 3 * 4); return 0; }')).toBe('14');
  });

  it('returns a compile error (not a crash) for invalid Toy C', () => {
    const report = runner.run('bad.c', 'int main() { return y; }');
    expect(report.ok).toBe(false);
    expect(report.diagnostics.some((d) => d.severity === 'error')).toBe(true);
  });
});
