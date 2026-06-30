import { ok, err } from '@novaos/shared';
import { contentRef, type ContentRef } from './ids';
import { fsError, type FsResult } from './errors';

export interface ContentStoreSnapshot {
  readonly entries: Record<string, number[]>;
  readonly nextRef: number;
}

/**
 * Stores file content separately from inode metadata (spec §7). This separation
 * keeps future copy-on-write / dedup / persistence straightforward. Milestone 3
 * uses a simple in-memory byte store.
 */
export interface FileContentStore {
  create(bytes: Uint8Array): ContentRef;
  read(ref: ContentRef): FsResult<Uint8Array>;
  write(ref: ContentRef, bytes: Uint8Array): FsResult<void>;
  delete(ref: ContentRef): FsResult<void>;
  snapshot(): ContentStoreSnapshot;
  restore(snapshot: ContentStoreSnapshot): void;
}

export function createContentStore(): FileContentStore {
  let entries = new Map<string, Uint8Array>();
  let nextRef = 1;

  const missing = (ref: ContentRef) =>
    err(fsError('fs/missing-content', `Content ref ${ref} does not exist.`));

  return {
    create(bytes) {
      const ref = contentRef(`content-${nextRef}`);
      nextRef += 1;
      entries.set(ref, Uint8Array.from(bytes));
      return ref;
    },
    read(ref) {
      const stored = entries.get(ref);
      return stored ? ok(Uint8Array.from(stored)) : missing(ref);
    },
    write(ref, bytes) {
      if (!entries.has(ref)) return missing(ref);
      entries.set(ref, Uint8Array.from(bytes));
      return ok(undefined);
    },
    delete(ref) {
      if (!entries.delete(ref)) return missing(ref);
      return ok(undefined);
    },
    snapshot() {
      const out: Record<string, number[]> = {};
      for (const key of [...entries.keys()].sort()) {
        out[key] = Array.from(entries.get(key) as Uint8Array);
      }
      return { entries: out, nextRef };
    },
    restore(snapshot) {
      entries = new Map(Object.entries(snapshot.entries).map(([k, v]) => [k, Uint8Array.from(v)]));
      nextRef = snapshot.nextRef;
    },
  };
}
