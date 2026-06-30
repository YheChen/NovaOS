import { describe, it, expect } from 'vitest';
import { createBufferedOutput } from './output';

describe('BufferedOutput', () => {
  it('accumulates written text', () => {
    const out = createBufferedOutput();
    out.write('15\n');
    out.write('20\n');
    expect(out.getText()).toBe('15\n20\n');
  });

  it('splits into lines and drops a single trailing newline', () => {
    const out = createBufferedOutput();
    out.write('15\n');
    expect(out.getLines()).toEqual(['15']);
  });

  it('clears the buffer', () => {
    const out = createBufferedOutput();
    out.write('x');
    out.clear();
    expect(out.getText()).toBe('');
  });
});
