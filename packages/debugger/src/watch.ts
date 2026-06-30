import type { RegisterFileSnapshot, RegisterName } from '@novaos/cpu';

/**
 * A tiny safe expression evaluator for watch expressions and conditional
 * breakpoints. It never uses host `eval`/`new Function`. Grammar:
 *
 *   expr       -> comparison
 *   comparison -> additive (("=="|"!="|"<"|"<="|">"|">=") additive)?
 *   additive   -> term (("+"|"-") term)*
 *   term       -> factor (("*"|"/"|"%") factor)*
 *   factor     -> number | register | "mem" "[" expr "]" | "(" expr ")"
 *   register   -> R0..R7 | SP | BP | PC | IR (case-insensitive)
 */
export interface EvalContext {
  readonly registers: RegisterFileSnapshot;
  readonly readWord: (address: number) => number | null;
}

export type EvalResult = { ok: true; value: number } | { ok: false; error: string };

type Tok =
  { kind: 'num'; value: number } | { kind: 'ident'; value: string } | { kind: 'op'; value: string };

const REGISTER_NAMES: Record<string, RegisterName> = {
  R0: 'r0',
  R1: 'r1',
  R2: 'r2',
  R3: 'r3',
  R4: 'r4',
  R5: 'r5',
  R6: 'r6',
  R7: 'r7',
  SP: 'sp',
  BP: 'bp',
  PC: 'pc',
  IR: 'ir',
};

function tokenize(input: string): Tok[] | string {
  const tokens: Tok[] = [];
  let i = 0;
  const ops = ['==', '!=', '<=', '>=', '<', '>', '+', '-', '*', '/', '%', '(', ')', '[', ']'];
  while (i < input.length) {
    const ch = input[i] as string;
    if (ch === ' ' || ch === '\t') {
      i += 1;
      continue;
    }
    if (ch >= '0' && ch <= '9') {
      let num = '';
      while (i < input.length && /[0-9]/.test(input[i] as string)) num += input[i++];
      tokens.push({ kind: 'num', value: Number.parseInt(num, 10) });
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let id = '';
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i] as string)) id += input[i++];
      tokens.push({ kind: 'ident', value: id });
      continue;
    }
    const op = ops.find((o) => input.startsWith(o, i));
    if (op) {
      tokens.push({ kind: 'op', value: op });
      i += op.length;
      continue;
    }
    return `Unexpected character ${JSON.stringify(ch)} in expression.`;
  }
  return tokens;
}

const mask32 = (n: number): number => n >>> 0;
const signed = (n: number): number => n | 0;

export function evaluateExpression(expr: string, ctx: EvalContext): EvalResult {
  const toks = tokenize(expr);
  if (typeof toks === 'string') return { ok: false, error: toks };
  let pos = 0;
  let failure: string | null = null;
  const peek = (): Tok | undefined => toks[pos];
  const eat = (): Tok | undefined => toks[pos++];
  const fail = (msg: string): number => {
    if (!failure) failure = msg;
    return 0;
  };

  const parseFactor = (): number => {
    const t = peek();
    if (!t) return fail('Unexpected end of expression.');
    if (t.kind === 'num') {
      eat();
      return mask32(t.value);
    }
    if (t.kind === 'ident') {
      eat();
      if (t.value.toLowerCase() === 'mem') {
        if (peek()?.kind !== 'op' || (peek() as Tok).value !== '[')
          return fail('Expected `[` after `mem`.');
        eat();
        const addr = parseExpr();
        if (peek()?.kind !== 'op' || (peek() as Tok).value !== ']') return fail('Expected `]`.');
        eat();
        const word = ctx.readWord(mask32(addr));
        if (word === null) return fail(`Cannot read memory at 0x${mask32(addr).toString(16)}.`);
        return word;
      }
      const reg = REGISTER_NAMES[t.value.toUpperCase()];
      if (!reg)
        return fail(`Unknown name \`${t.value}\` (use a register like R0, SP, or mem[...]).`);
      return ctx.registers[reg];
    }
    if (t.kind === 'op' && t.value === '(') {
      eat();
      const v = parseExpr();
      if (peek()?.kind !== 'op' || (peek() as Tok).value !== ')') return fail('Expected `)`.');
      eat();
      return v;
    }
    return fail(`Unexpected token \`${t.value}\`.`);
  };

  const parseTerm = (): number => {
    let left = parseFactor();
    for (;;) {
      const t = peek();
      if (t?.kind !== 'op' || !['*', '/', '%'].includes(t.value)) break;
      eat();
      const right = parseFactor();
      if (t.value === '*') left = mask32(Math.imul(left, right));
      else if (right === 0) return fail('Division by zero.');
      else
        left = mask32(
          t.value === '/' ? Math.trunc(signed(left) / signed(right)) : signed(left) % signed(right),
        );
    }
    return left;
  };

  const parseAdditive = (): number => {
    let left = parseTerm();
    for (;;) {
      const t = peek();
      if (t?.kind !== 'op' || !['+', '-'].includes(t.value)) break;
      eat();
      const right = parseTerm();
      left = mask32(t.value === '+' ? left + right : left - right);
    }
    return left;
  };

  const parseExpr = (): number => {
    const left = parseAdditive();
    const t = peek();
    if (t?.kind === 'op' && ['==', '!=', '<', '<=', '>', '>='].includes(t.value)) {
      eat();
      const right = parseAdditive();
      switch (t.value) {
        case '==':
          return left === right ? 1 : 0;
        case '!=':
          return left !== right ? 1 : 0;
        case '<':
          return signed(left) < signed(right) ? 1 : 0;
        case '<=':
          return signed(left) <= signed(right) ? 1 : 0;
        case '>':
          return signed(left) > signed(right) ? 1 : 0;
        case '>=':
          return signed(left) >= signed(right) ? 1 : 0;
      }
    }
    return left;
  };

  const value = parseExpr();
  if (failure) return { ok: false, error: failure };
  if (pos !== toks.length) return { ok: false, error: 'Trailing tokens in expression.' };
  return { ok: true, value: mask32(value) };
}
