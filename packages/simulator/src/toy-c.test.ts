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

  it('runs a for loop with compound assignment: sum 1..5 => 15', () => {
    expect(
      run(
        'for.c',
        `int main() {
  int s = 0;
  for (int i = 1; i <= 5; i += 1) {
    s += i;
  }
  print(s);
  return 0;
}`,
      ),
    ).toBe('15');
  });

  it('supports compound assignment operators', () => {
    expect(
      run(
        'compound.c',
        `int main() {
  int x = 10;
  x += 5;
  x -= 3;
  x *= 2;
  print(x);
  return 0;
}`,
      ),
    ).toBe('24');
  });

  it('short-circuits && (RHS side effect is skipped)', () => {
    // If `&&` short-circuits, sideEffect() never runs, so 99 is never printed.
    expect(
      run(
        'sc-and.c',
        `int sideEffect() { print(99); return 1; }
int main() {
  if (false && sideEffect() == 1) { print(1); } else { print(0); }
  return 0;
}`,
      ),
    ).toBe('0');
  });

  it('short-circuits || (RHS side effect is skipped)', () => {
    expect(
      run(
        'sc-or.c',
        `int sideEffect() { print(99); return 1; }
int main() {
  if (true || sideEffect() == 1) { print(1); } else { print(0); }
  return 0;
}`,
      ),
    ).toBe('1');
  });

  it('evaluates both sides of && when needed', () => {
    expect(
      run(
        'and.c',
        `int main() {
  int a = 1;
  int b = 1;
  if (a == 1 && b == 1) { print(7); } else { print(0); }
  return 0;
}`,
      ),
    ).toBe('7');
  });

  it('loads a 32-bit constant greater than 65535', () => {
    expect(run('big.c', 'int main() { print(100000); return 0; }')).toBe('100000');
  });

  it('computes bitwise operators', () => {
    expect(run('band.c', 'int main() { print(6 & 3); return 0; }')).toBe('2');
    expect(run('bor.c', 'int main() { print(5 | 2); return 0; }')).toBe('7');
    expect(run('bxor.c', 'int main() { print(6 ^ 3); return 0; }')).toBe('5');
    expect(run('shl.c', 'int main() { print(1 << 4); return 0; }')).toBe('16');
    expect(run('shr.c', 'int main() { print(64 >> 2); return 0; }')).toBe('16');
  });

  it('supports dynamic memory: malloc / poke / peek / free', () => {
    expect(
      run(
        'heap.c',
        `int main() {
  int p = malloc(8);
  poke(p, 42);
  poke(p + 4, 8);
  print(peek(p) + peek(p + 4));
  free(p);
  return 0;
}`,
      ),
    ).toBe('50');
  });

  it('respects bitwise vs arithmetic precedence (1 | 2 & 2 => 3)', () => {
    // & binds tighter than |, so this is 1 | (2 & 2) = 1 | 2 = 3.
    expect(run('prec.c', 'int main() { print(1 | 2 & 2); return 0; }')).toBe('3');
  });

  it('returns a compile error (not a crash) for invalid Toy C', () => {
    const report = runner.run('bad.c', 'int main() { return y; }');
    expect(report.ok).toBe(false);
    expect(report.diagnostics.some((d) => d.severity === 'error')).toBe(true);
  });
});
