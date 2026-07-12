import { ok, err } from '@novaos/shared';
import type { FileSystemSnapshot } from './filesystem';
import { fsError, type FsResult } from './errors';

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

/**
 * The on-the-wire envelope version. Bump when the envelope shape changes — this
 * is independent of the inner `FileSystemSnapshot.version` (the inode model),
 * so the storage transport can evolve separately from the data model.
 */
export const PERSISTED_ENVELOPE_VERSION = 1;

/**
 * Transport-safe wrapper around a snapshot. `payload` is a `FileSystemSnapshot`,
 * which is already composed only of JSON / structured-clone-safe values (numbers,
 * strings, plain records, `number[]` for bytes) — no `Uint8Array`, `Map`, or
 * class instances.
 */
export interface PersistedFileSystem {
  readonly envelopeVersion: number;
  readonly payload: FileSystemSnapshot;
}

/** Pure: wrap a snapshot for storage. Deterministic — no clock, no randomness. */
export function toPersisted(snapshot: FileSystemSnapshot): PersistedFileSystem {
  return { envelopeVersion: PERSISTED_ENVELOPE_VERSION, payload: snapshot };
}

/**
 * Pure: validate a value read back from storage and extract the snapshot.
 * Returns an `FsResult` so callers get a typed error instead of a throw. Future
 * envelope migrations are handled here.
 */
export function fromPersisted(raw: unknown): FsResult<FileSystemSnapshot> {
  if (typeof raw !== 'object' || raw === null || !('envelopeVersion' in raw)) {
    return err(fsError('fs/snapshot-corrupt', 'Persisted filesystem is not a valid envelope.'));
  }
  const env = raw as Partial<PersistedFileSystem>;
  if (env.envelopeVersion !== PERSISTED_ENVELOPE_VERSION) {
    return err(
      fsError(
        'fs/snapshot-version',
        `Persisted envelope version ${String(env.envelopeVersion)} unsupported (expected ${PERSISTED_ENVELOPE_VERSION}).`,
      ),
    );
  }
  if (!env.payload || typeof env.payload.version !== 'number') {
    return err(fsError('fs/snapshot-corrupt', 'Persisted envelope is missing its payload.'));
  }
  return ok(env.payload);
}
