import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSimulationClock, ok, err } from '@novaos/shared';
import {
  createFileSystem,
  createInMemoryStorageProvider,
  fsError,
  type FileSystemStorageProvider,
} from '@novaos/filesystem';
import { createAutosave } from './autosave';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const freshFs = () => createFileSystem({ clock: createSimulationClock() });

describe('createAutosave', () => {
  it('coalesces a burst of schedule() calls into a single save', async () => {
    const provider = createInMemoryStorageProvider();
    const spy = vi.spyOn(provider, 'save');
    const autosave = createAutosave(freshFs(), provider, { debounceMs: 500 });
    autosave.schedule();
    autosave.schedule();
    autosave.schedule();
    expect(spy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(spy).toHaveBeenCalledTimes(1);
    autosave.dispose();
  });

  it('flush() writes immediately', async () => {
    const provider = createInMemoryStorageProvider();
    const spy = vi.spyOn(provider, 'save');
    await createAutosave(freshFs(), provider).flush();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('swallows a failing save (warns, never throws)', async () => {
    const failing: FileSystemStorageProvider = {
      load: () => Promise.resolve(ok(null)),
      save: () => Promise.resolve(err(fsError('x', 'nope'))),
      clear: () => Promise.resolve(ok(undefined)),
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(createAutosave(freshFs(), failing).flush()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
