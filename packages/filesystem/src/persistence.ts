import { ok } from '@novaos/shared';
import type { FileSystemSnapshot } from './filesystem';
import type { FsResult } from './errors';

/**
 * Persistence adapter contract (spec §14). The real browser adapter (IndexedDB)
 * lives in `apps/web`, since domain packages must stay DOM-free. Milestone 3
 * ships this interface plus an in-memory provider used by tests and as the
 * default skeleton; snapshots are versioned for future migration.
 */
export interface FileSystemStorageProvider {
  load(): Promise<FsResult<FileSystemSnapshot | null>>;
  save(snapshot: FileSystemSnapshot): Promise<FsResult<void>>;
  clear(): Promise<FsResult<void>>;
}

export function createInMemoryStorageProvider(): FileSystemStorageProvider {
  let stored: FileSystemSnapshot | null = null;
  return {
    load: () => Promise.resolve(ok(stored)),
    save: (snapshot) => {
      stored = snapshot;
      return Promise.resolve(ok(undefined));
    },
    clear: () => {
      stored = null;
      return Promise.resolve(ok(undefined));
    },
  };
}
