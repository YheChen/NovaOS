import type { OutputSink } from '@novaos/cpu';

/** An in-memory output sink that accumulates program output for inspection. */
export interface BufferedOutput extends OutputSink {
  getText(): string;
  getLines(): string[];
  clear(): void;
}

export function createBufferedOutput(): BufferedOutput {
  const chunks: string[] = [];
  return {
    write: (text: string) => {
      chunks.push(text);
    },
    getText: () => chunks.join(''),
    getLines: () => {
      const text = chunks.join('');
      const lines = text.split('\n');
      // Drop a single trailing empty line produced by a final newline.
      if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
      return lines;
    },
    clear: () => {
      chunks.length = 0;
    },
  };
}
