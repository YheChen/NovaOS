import {
  type FileSystemStorageProvider,
  type FileSystemSnapshot,
  toPersisted,
  fromPersisted,
  fsError,
} from '@novaos/filesystem';
import { ok, err } from '@novaos/shared';

const DB_NAME = 'novaos';
const DB_VERSION = 1; // IndexedDB *schema* version (object-store layout)
const STORE = 'filesystem';
const KEY = 'root'; // single-document store: one FS per browser origin

/**
 * Minimal async key/value surface so the provider logic can be unit-tested
 * against a fake without a real browser. `openIdbStore()` is the only thing that
 * touches the real `indexedDB` global.
 */
export interface AsyncKeyValueStore {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

/** True only when a usable IndexedDB is present (false in SSR / some private modes). */
export function isIndexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

/** Promisified single-store IndexedDB KV. All open/txn errors reject. */
export function openIdbStore(): AsyncKeyValueStore {
  const openDb = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
      req.onblocked = () => reject(new Error('indexedDB open blocked'));
    });

  const run = <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> =>
    openDb().then(
      (db) =>
        new Promise<T>((resolve, reject) => {
          const tx = db.transaction(STORE, mode);
          const req = fn(tx.objectStore(STORE));
          req.onsuccess = () => resolve(req.result as T);
          req.onerror = () => reject(req.error ?? new Error('indexedDB txn failed'));
          tx.oncomplete = () => db.close();
        }),
    );

  return {
    get: (key) => run<unknown>('readonly', (s) => s.get(key)),
    put: (key, value) => run<void>('readwrite', (s) => s.put(value, key)),
    delete: (key) => run<void>('readwrite', (s) => s.delete(key)),
  };
}

/**
 * Build a `FileSystemStorageProvider` over any `AsyncKeyValueStore`. Tests inject
 * a fake store; production injects `openIdbStore()`. All storage errors are
 * mapped to typed `FsResult`s — this never throws.
 */
export function createFsStorageProvider(store: AsyncKeyValueStore): FileSystemStorageProvider {
  return {
    async load() {
      try {
        const raw = await store.get(KEY);
        if (raw === undefined || raw === null) return ok(null);
        return fromPersisted(raw);
      } catch (e) {
        return err(fsError('fs/storage-read', `IndexedDB read failed: ${String(e)}`));
      }
    },
    async save(snapshot: FileSystemSnapshot) {
      try {
        await store.put(KEY, toPersisted(snapshot));
        return ok(undefined);
      } catch (e) {
        return err(fsError('fs/storage-write', `IndexedDB write failed: ${String(e)}`));
      }
    },
    async clear() {
      try {
        await store.delete(KEY);
        return ok(undefined);
      } catch (e) {
        return err(fsError('fs/storage-clear', `IndexedDB clear failed: ${String(e)}`));
      }
    },
  };
}

/** An ephemeral no-op provider (used when IndexedDB is unavailable). */
export function createNoopStorageProvider(): FileSystemStorageProvider {
  return {
    load: () => Promise.resolve(ok(null)),
    save: () => Promise.resolve(ok(undefined)),
    clear: () => Promise.resolve(ok(undefined)),
  };
}

/**
 * Production entry point with graceful fallback: when IndexedDB is unavailable
 * (SSR, private mode, disabled) it returns a no-op provider so the app still
 * runs — the filesystem simply won't survive a reload.
 */
export function createBrowserFsStorageProvider(): FileSystemStorageProvider {
  if (!isIndexedDbAvailable()) return createNoopStorageProvider();
  try {
    return createFsStorageProvider(openIdbStore());
  } catch {
    return createNoopStorageProvider();
  }
}
