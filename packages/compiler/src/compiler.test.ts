import { describe, it, expect } from 'vitest';
import { lex } from './lexer';
import { parse } from './parser';
import { analyze } from './semantics';
import { compileToyC } from './compile';
import { toInspectorSnapshot } from './inspector';

const ACCEPTANCE = `int main() {
  int a = 5;
  int b = 10;
  int c = a + b;
  print(c);
  return 0;
}
`;

describe('lexer', () => {
  it('tokenizes keywords, identifiers, integers, and operators with spans', () => {
    const { tokens } = lex('int x = 42;');
    expect(tokens.map((t) => t.kind)).toEqual([
      'keyword',
      'identifier',
      'operator',
      'integer',
      'punctuation',
      'eof',
    ]);
    expect(tokens[3]?.value).toBe(42);
    expect(tokens[0]?.span.start.line).toBe(1);
  });

  it('keeps comments separate and flags an unterminated block comment', () => {
    const ok = lex('int x; // hi\n/* block */');
    expect(ok.comments.length).toBe(2);
    expect(ok.diagnostics).toHaveLength(0);
    const bad = lex('/* unterminated');
    expect(bad.diagnostics[0]?.code).toBe('lex/unterminated-comment');
  });
});

describe('parser', () => {
  it('builds an immutable AST with declarations and spans', () => {
    const { program, diagnostics } = parse(ACCEPTANCE);
    expect(diagnostics).toHaveLength(0);
    expect(program.declarations).toHaveLength(1);
    const main = program.declarations[0];
    expect(main?.kind).toBe('FunctionDeclaration');
    if (main?.kind === 'FunctionDeclaration') {
      expect(main.name.name).toBe('main');
      expect(main.body.statements).toHaveLength(5);
    }
  });

  it('respects operator precedence (a + b * c)', () => {
    const { program } = parse('int main() { int x = 1 + 2 * 3; return 0; }');
    const fn = program.declarations[0];
    if (fn?.kind !== 'FunctionDeclaration') throw new Error('expected fn');
    const decl = fn.body.statements[0];
    if (decl?.kind !== 'VariableDeclaration' || decl.initializer?.kind !== 'BinaryExpression') {
      throw new Error('expected binary initializer');
    }
    expect(decl.initializer.operator).toBe('+');
    expect(decl.initializer.right.kind).toBe('BinaryExpression'); // 2 * 3 binds tighter
  });

  it('recovers from a missing semicolon and reports it', () => {
    const { diagnostics } = parse('int main() { int x = 5 return 0; }');
    expect(diagnostics.some((d) => d.code === 'parse/unexpected-token')).toBe(true);
  });
});

describe('semantics', () => {
  const errs = (src: string) => analyze(parse(src).program).diagnostics.map((d) => d.code);

  it('accepts the acceptance program', () => {
    expect(analyze(parse(ACCEPTANCE).program).diagnostics).toHaveLength(0);
  });

  it('reports undefined variables', () => {
    expect(errs('int main() { return y; }')).toContain('sema/undefined');
  });

  it('reports type mismatches', () => {
    expect(errs('int main() { int x = true; return 0; }')).toContain('sema/type-error');
  });

  it('reports call arity errors', () => {
    expect(errs('int add(int a, int b) { return a + b; } int main() { return add(1); }')).toContain(
      'sema/arity',
    );
  });

  it('reports a missing main', () => {
    expect(errs('int add(int a) { return a; }')).toContain('sema/no-main');
  });

  it('rejects using an array as a scalar value', () => {
    expect(errs('int main() { int a[2]; print(a); return 0; }')).toContain('sema/type-error');
  });

  it('reports duplicate declarations', () => {
    expect(errs('int main() { int x = 1; int x = 2; return 0; }')).toContain('sema/duplicate');
  });

  it('rejects break/continue outside a loop', () => {
    expect(errs('int main() { break; return 0; }')).toContain('sema/illegal-jump');
    expect(errs('int main() { continue; return 0; }')).toContain('sema/illegal-jump');
  });

  it('accepts break and continue inside a loop', () => {
    expect(
      analyze(
        parse(
          'int main() { while (true) { break; } for (int i=0;i<1;i+=1) { continue; } return 0; }',
        ).program,
      ).diagnostics,
    ).toHaveLength(0);
  });
});

describe('compileToyC', () => {
  it('compiles the acceptance program through every stage', () => {
    const result = compileToyC(ACCEPTANCE, { fileName: 'hello.c' });
    expect(result.success).toBe(true);
    expect(result.ast).not.toBeNull();
    expect(result.ir).not.toBeNull();
    expect(result.optimizedIr).not.toBeNull();
    expect(result.assembly).toContain('CALL main');
    expect(result.bytecode).not.toBeNull();
    expect(result.sourceMap?.entries.length).toBeGreaterThan(0);
  });

  it('is deterministic — identical source yields byte-identical bytecode', () => {
    const a = compileToyC(ACCEPTANCE, { fileName: 'hello.c' });
    const b = compileToyC(ACCEPTANCE, { fileName: 'hello.c' });
    expect(Array.from(a.bytecode?.code ?? [])).toEqual(Array.from(b.bytecode?.code ?? []));
  });

  it('constant-folds 2 + 3 into a single const', () => {
    const result = compileToyC('int main() { int x = 2 + 3; print(x); return 0; }');
    const fold = result.optimizationPasses.find((p) => p.id === 'const-fold');
    expect(fold?.changes).toBeGreaterThan(0);
  });

  it('lets optimization passes be toggled off', () => {
    const off = compileToyC('int main() { int x = 2 + 3; print(x); return 0; }', {
      optimize: { constantFolding: false, copyPropagation: false, deadCodeElimination: false },
    });
    expect(off.optimizationPasses).toHaveLength(0);
    expect(off.success).toBe(true);
  });

  it('exposes a UI inspector snapshot for every stage', () => {
    const snap = toInspectorSnapshot(compileToyC(ACCEPTANCE, { fileName: 'hello.c' }));
    expect(snap.tokens.length).toBeGreaterThan(0);
    expect(snap.irText).toContain('func main');
    expect(snap.bytecode).not.toBeNull();
  });

  it('fails (no bytecode) on a program with errors', () => {
    const result = compileToyC('int main() { return y; }');
    expect(result.success).toBe(false);
    expect(result.bytecode).toBeNull();
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
});
