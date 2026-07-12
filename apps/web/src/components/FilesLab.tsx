import { useEffect, useRef, useState } from 'react';
import { createSimulationClock } from '@novaos/shared';
import {
  createFileSystem,
  fsContext,
  absolutePath,
  type FileSystem,
  type DirectoryEntry,
} from '@novaos/filesystem';
import { createBrowserFsStorageProvider } from '../persistence/indexeddb-fs-provider';
import { createAutosave, type AutosaveHandle } from '../persistence/autosave';

const ctx = fsContext(absolutePath('/'));

export function FilesLab() {
  const fsRef = useRef<FileSystem | null>(null);
  const providerRef = useRef(createBrowserFsStorageProvider());
  const autosaveRef = useRef<AutosaveHandle | null>(null);
  const [ready, setReady] = useState(false);
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [name, setName] = useState('notes.txt');
  const [content, setContent] = useState('hello from NovaOS');
  const [status, setStatus] = useState('');
  const [viewing, setViewing] = useState<{ name: string; text: string } | null>(null);

  if (fsRef.current === null) {
    fsRef.current = createFileSystem({ clock: createSimulationClock() });
  }

  const refresh = () => {
    const res = fsRef.current?.list('/', ctx);
    setEntries(res && res.ok ? res.value : []);
  };

  // Boot: load the persisted filesystem from IndexedDB, then start autosave.
  useEffect(() => {
    let cancelled = false;
    const fs = fsRef.current;
    const provider = providerRef.current;
    if (!fs) return;
    void (async () => {
      const loaded = await provider.load();
      if (cancelled) return;
      if (loaded.ok && loaded.value) {
        const restored = fs.restore(loaded.value);
        if (!restored.ok) await provider.clear(); // drop an incompatible document
      }
      if (cancelled) return;
      autosaveRef.current = createAutosave(fs, provider, { debounceMs: 400 });
      refresh();
      setReady(true);
    })();
    return () => {
      cancelled = true;
      autosaveRef.current?.dispose();
    };
  }, []);

  // Flush on tab hide so the last edit survives a close.
  useEffect(() => {
    const onHide = () => void autosaveRef.current?.flush();
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, []);

  const afterMutation = async (label: string, okFlag: boolean, message?: string) => {
    if (!okFlag) {
      setStatus(message ?? 'error');
      return;
    }
    refresh();
    await autosaveRef.current?.flush(); // persist immediately so a reload sees it
    setStatus(`${label} · saved`);
  };

  const createFile = async () => {
    const r = fsRef.current?.writeText(`/${name}`, content, ctx);
    await afterMutation(`wrote /${name}`, !!r?.ok, r && !r.ok ? r.error.message : undefined);
  };
  const createFolder = async () => {
    const r = fsRef.current?.createDirectory(`/${name}`, { recursive: true }, ctx);
    await afterMutation(`created /${name}/`, !!r?.ok, r && !r.ok ? r.error.message : undefined);
  };
  const remove = async (entryName: string) => {
    const r = fsRef.current?.remove(`/${entryName}`, { recursive: true, force: true }, ctx);
    if (viewing?.name === entryName) setViewing(null);
    await afterMutation(`removed /${entryName}`, !!r?.ok, r && !r.ok ? r.error.message : undefined);
  };
  const view = (entryName: string) => {
    const r = fsRef.current?.readText(`/${entryName}`, ctx);
    if (r?.ok) setViewing({ name: entryName, text: r.value });
    else if (r && !r.ok) setStatus(r.error.message);
  };

  return (
    <div className="conc-lab" data-testid="files-lab">
      <div className="panel-title">Files · a virtual filesystem that survives reloads</div>
      <div className="panel-body">
        <p className="muted" style={{ marginTop: 0 }}>
          An in-memory VFS persisted to IndexedDB via a snapshot envelope. Create files and folders,
          then reload the page — the tree is restored from durable storage.
        </p>

        {!ready ? (
          <p className="muted">Loading persisted filesystem…</p>
        ) : (
          <>
            <div className="conc-controls">
              <label>
                name
                <input
                  type="text"
                  value={name}
                  className="seed-input"
                  style={{ width: 160 }}
                  data-testid="files-name"
                  aria-label="File or folder name"
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <button className="primary" data-testid="files-create" onClick={createFile}>
                Create file
              </button>
              <button data-testid="files-mkdir" onClick={createFolder}>
                New folder
              </button>
            </div>
            <textarea
              className="seed-input"
              style={{ width: '100%', minHeight: 60, fontFamily: 'var(--mono)' }}
              value={content}
              data-testid="files-content"
              aria-label="File content"
              onChange={(e) => setContent(e.target.value)}
            />

            {status && (
              <div className="terminal" style={{ minHeight: 'auto' }} data-testid="files-status">
                {status}
              </div>
            )}

            <h4 className="muted">Contents of /</h4>
            <table data-testid="files-listing">
              <thead>
                <tr>
                  <th>name</th>
                  <th>kind</th>
                  <th>size</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.name}>
                    <td>
                      {e.kind === 'directory' ? '📁 ' : '📄 '}
                      {e.name}
                    </td>
                    <td className="muted">{e.kind}</td>
                    <td className="muted">{e.sizeBytes}</td>
                    <td>
                      {e.kind === 'file' && (
                        <button onClick={() => view(e.name)} aria-label={`View ${e.name}`}>
                          view
                        </button>
                      )}{' '}
                      <button onClick={() => remove(e.name)} aria-label={`Delete ${e.name}`}>
                        delete
                      </button>
                    </td>
                  </tr>
                ))}
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      empty
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {viewing && (
              <>
                <h4 className="muted">{viewing.name}</h4>
                <div className="terminal">{viewing.text}</div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
