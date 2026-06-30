import { describe, it, expect } from 'vitest';
import { createProgramRunner } from '@novaos/simulator';
import { EXAMPLES } from './programs';

/**
 * Every shipped example must compile and run to its documented output. This is
 * the safety net behind the workspace's example gallery and the tutorials.
 */
const runner = createProgramRunner();

describe('example programs', () => {
  it('ships a non-empty, unique-id gallery', () => {
    expect(EXAMPLES.length).toBeGreaterThan(0);
    expect(new Set(EXAMPLES.map((e) => e.id)).size).toBe(EXAMPLES.length);
  });

  for (const example of EXAMPLES) {
    it(`${example.id} (${example.fileName}) prints ${example.expectedOutput}`, () => {
      const report = runner.run(example.fileName, example.source);
      expect(report.ok).toBe(true);
      expect(report.output.trim()).toBe(example.expectedOutput);
    });
  }
});
