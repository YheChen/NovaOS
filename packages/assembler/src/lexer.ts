import { parseRegister, parseImmediate } from './isa';

export type AsmTokenKind =
  'directive' | 'label' | 'symbol' | 'register' | 'immediate' | 'comma' | 'eol' | 'eof';

export interface AsmToken {
  readonly kind: AsmTokenKind;
  readonly value: string;
  readonly line: number;
  readonly column: number;
}

function classify(word: string, line: number, column: number): AsmToken {
  if (word.endsWith(':')) return { kind: 'label', value: word.slice(0, -1), line, column };
  if (word.startsWith('.')) return { kind: 'directive', value: word, line, column };
  if (parseRegister(word) !== null) return { kind: 'register', value: word, line, column };
  if (parseImmediate(word) !== null && /^[#0-9-]/.test(word)) {
    return { kind: 'immediate', value: word, line, column };
  }
  return { kind: 'symbol', value: word, line, column };
}

/** Tokenize NovaASM source. Comments (`;` to end of line) are stripped. */
export function tokenize(source: string): AsmToken[] {
  const tokens: AsmToken[] = [];
  const lines = source.split('\n');
  lines.forEach((rawLine, index) => {
    const line = index + 1;
    const semicolon = rawLine.indexOf(';');
    const text = semicolon >= 0 ? rawLine.slice(0, semicolon) : rawLine;
    let i = 0;
    while (i < text.length) {
      const ch = text.charAt(i);
      if (ch === ' ' || ch === '\t' || ch === '\r') {
        i += 1;
        continue;
      }
      if (ch === ',') {
        tokens.push({ kind: 'comma', value: ',', line, column: i + 1 });
        i += 1;
        continue;
      }
      let word = '';
      const column = i + 1;
      while (i < text.length && !/[\s,]/.test(text.charAt(i))) {
        word += text.charAt(i);
        i += 1;
      }
      tokens.push(classify(word, line, column));
    }
    tokens.push({ kind: 'eol', value: '', line, column: text.length + 1 });
  });
  tokens.push({ kind: 'eof', value: '', line: lines.length + 1, column: 1 });
  return tokens;
}
