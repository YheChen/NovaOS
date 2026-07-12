import type { FileSystem, FileSystemStorageProvider } from '@novaos/filesystem';

export interface AutosaveHandle {
  /** Call after any mutation; coalesces bursts into a single write. */
  schedule(): void;
  /** Force an immediate flush (e.g. on pagehide, or before a reload). */
  flush(): Promise<void>;
  dispose(): void;
}

/**
 * A debounced filesystem autosaver. `snapshot()` is synchronous and pure, so it
 * is captured inside the debounce callback (after the mutation returns) and the
 * async write is confined to the app layer — the domain FS never awaits.
 */
export function createAutosave(
  fs: FileSystem,
  provider: FileSystemStorageProvider,
  opts: { debounceMs?: number } = {},
): AutosaveHandle {
  const debounceMs = opts.debounceMs ?? 500;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const doSave = async (): Promise<void> => {
    const res = await provider.save(fs.snapshot());
    if (!res.ok) console.warn('[novaos] filesystem autosave failed:', res.error);
  };

  return {
    schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void doSave();
      }, debounceMs);
    },
    async flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await doSave();
    },
    dispose() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
