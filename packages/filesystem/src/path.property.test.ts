import { describe, it, expect } from 'vitest';
import { createSeededRandom } from '@novaos/shared';
import { canonicalize } from './path';
import { absolutePath } from './ids';

/**
 * Property/fuzz test: canonicalize must always return an absolute path with no
 * `.`/`..` segments, must be idempotent, and must never escape the root (even
 * with excess `..`). Uses a seeded PRNG for reproducibility.
 */
describe('path canonicalize (property)', () => {
  const cwd = absolutePath('/home/student');
  const home = absolutePath('/home/student');
  const parts = ['a', 'b', 'c', 'dir', '.', '..'];

  it('produces normalized, idempotent, root-safe paths', () => {
    const rng = createSeededRandom(777);
    for (let i = 0; i < 400; i += 1) {
      const count = rng.nextInt(0, 8);
      const segs: string[] = [];
      for (let k = 0; k < count; k += 1) segs.push(parts[rng.nextInt(0, parts.length)] as string);
      let input = (rng.nextInt(0, 2) === 0 ? '/' : '') + segs.join('/');
      if (input === '') input = '/';

      const result = canonicalize(input, cwd, home);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const path = result.value as string;
      expect(path.startsWith('/')).toBe(true);
      for (const s of path.split('/').filter(Boolean)) {
        expect(s === '.' || s === '..').toBe(false);
      }
      const again = canonicalize(path, cwd, home);
      expect(again.ok && again.value).toBe(path); // idempotent
    }
  });
});
