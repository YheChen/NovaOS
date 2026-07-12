import { describe, it, expect } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createSimulationClock } from '@novaos/shared';
import {
  createFileSystem,
  fsContext,
  absolutePath,
  type FileSystemSnapshot,
} from '@novaos/filesystem';
import {
  createFsStorageProvider,
  createBrowserFsStorageProvider,
  isIndexedDbAvailable,
  type AsyncKeyValueStore,
} from './indexeddb-fs-provider';

const ctx = fsContext(absolutePath('/'));

function sampleSnapshot(): FileSystemSnapshot {
  const fs = createFileSystem({ clock: createSimulationClock() });
  fs.createDirectory('/data', { recursive: true }, ctx);
  fs.writeText('/data/a.txt', 'hello', ctx);
  return fs.snapshot();
}

function fakeStore(): AsyncKeyValueStore {
  const m = new Map<string, unknown>();
  return {
    get: (k) => Promise.resolve(m.get(k)),
    put: (k, v) => {
      m.set(k, structuredClone(v)); // mimic IndexedDB's structured clone
      return Promise.resolve();
    },
    delete: (k) => {
      m.delete(k);
      return Promise.resolve();
    },
  };
}

const rejectingStore: AsyncKeyValueStore = {
  get: () => Promise.reject(new Error('boom')),
  put: () => Promise.reject(new Error('boom')),
  delete: () => Promise.reject(new Error('boom')),
};

describe('createFsStorageProvider (injected KV store)', () => {
  it('loads null from an empty store', async () => {
    const loaded = await createFsStorageProvider(fakeStore()).load();
    expect(loaded).toEqual({ ok: true, value: null });
  });

  it('round-trips save → load', async () => {
    const provider = createFsStorageProvider(fakeStore());
    const snap = sampleSnapshot();
    await provider.save(snap);
    const loaded = await provider.load();
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.value).toEqual(snap);
  });

  it('maps a corrupt stored value to a typed error', async () => {
    const store = fakeStore();
    await store.put('root', { not: 'an envelope' });
    const loaded = await createFsStorageProvider(store).load();
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) expect(loaded.error.code).toBe('fs/snapshot-corrupt');
  });

  it('maps store rejections to fs/storage-* errors without throwing', async () => {
    const provider = createFsStorageProvider(rejectingStore);
    const l = await provider.load();
    const s = await provider.save(sampleSnapshot());
    const c = await provider.clear();
    expect(l.ok).toBe(false);
    if (!l.ok) expect(l.error.code).toBe('fs/storage-read');
    expect(s.ok).toBe(false);
    if (!s.ok) expect(s.error.code).toBe('fs/storage-write');
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.error.code).toBe('fs/storage-clear');
  });
});

describe('IndexedDB availability + end-to-end (fake-indexeddb)', () => {
  it('reports unavailable when the global is missing', () => {
    const g = globalThis as { indexedDB?: unknown };
    const saved = g.indexedDB;
    g.indexedDB = undefined;
    expect(isIndexedDbAvailable()).toBe(false);
    g.indexedDB = saved;
  });

  it('persists through the real IndexedDB code path', async () => {
    (globalThis as unknown as { indexedDB: unknown }).indexedDB = new IDBFactory();
    expect(isIndexedDbAvailable()).toBe(true);

    const provider = createBrowserFsStorageProvider();
    const snap = sampleSnapshot();
    expect((await provider.save(snap)).ok).toBe(true);

    const loaded = await provider.load();
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.value).toEqual(snap);

    expect((await provider.clear()).ok).toBe(true);
    expect(await provider.load()).toEqual({ ok: true, value: null });
  });
});
