import { describe, it, expect } from 'vitest';
import { createSimulationClock } from '@novaos/shared';
import { createTestEventBus } from '@novaos/testing';
import { createFileSystem, fsContext } from './filesystem';
import { absolutePath } from './ids';
import { createInMemoryStorageProvider } from './persistence';

const HOME = absolutePath('/home/student');
const ctx = () => fsContext(HOME);
const enc = (s: string) => new TextEncoder().encode(s);

function setup(withBus = false) {
  const clock = createSimulationClock();
  if (withBus) {
    const { bus, recorder } = createTestEventBus();
    return { fs: createFileSystem({ clock, bus }), recorder };
  }
  return { fs: createFileSystem({ clock }), recorder: null };
}

describe('FileSystem — seed tree', () => {
  it('lists the root with directories first, alphabetical', () => {
    const { fs } = setup();
    const root = fs.list('/', ctx());
    expect(root.ok).toBe(true);
    if (root.ok) expect(root.value.map((e) => e.name)).toEqual(['bin', 'home', 'tmp', 'usr']);
  });

  it('lists the student home directory', () => {
    const { fs } = setup();
    const home = fs.list('.', ctx());
    if (!home.ok) throw new Error(home.error.message);
    expect(home.value.map((e) => e.name)).toEqual(['README.txt', 'main.asm']);
  });

  it('stats a seeded file', () => {
    const { fs } = setup();
    const stat = fs.stat('README.txt', ctx());
    if (!stat.ok) throw new Error(stat.error.message);
    expect(stat.value.kind).toBe('file');
    expect(stat.value.permissions).toBe('rw-r--r--');
  });
});

describe('FileSystem — operations', () => {
  it('creates directories and files, then reads them back', () => {
    const { fs } = setup();
    expect(fs.createDirectory('demos', {}, ctx()).ok).toBe(true);
    expect(fs.createFile('demos/hello.asm', {}, ctx()).ok).toBe(true);
    expect(fs.writeText('demos/hello.asm', 'MOV R0, 5\n', ctx()).ok).toBe(true);

    const text = fs.readText('demos/hello.asm', ctx());
    if (!text.ok) throw new Error(text.error.message);
    expect(text.value).toBe('MOV R0, 5\n');

    const listing = fs.list('demos', ctx());
    if (listing.ok) expect(listing.value.map((e) => e.name)).toEqual(['hello.asm']);
  });

  it('appends to a file', () => {
    const { fs } = setup();
    fs.writeText('notes.txt', 'a\n', ctx());
    fs.appendFile('notes.txt', enc('b\n'), ctx());
    const text = fs.readText('notes.txt', ctx());
    if (text.ok) expect(text.value).toBe('a\nb\n');
  });

  it('requires -r to remove a non-empty directory', () => {
    const { fs } = setup();
    fs.createDirectory('demos', {}, ctx());
    fs.createFile('demos/a.txt', {}, ctx());
    const nonRecursive = fs.remove('demos', {}, ctx());
    expect(nonRecursive.ok).toBe(false);
    if (!nonRecursive.ok) expect(nonRecursive.error.code).toBe('fs/not-empty');
    expect(fs.remove('demos', { recursive: true }, ctx()).ok).toBe(true);
    expect(fs.stat('demos', ctx()).ok).toBe(false);
  });

  it('moves and copies files', () => {
    const { fs } = setup();
    fs.writeText('a.txt', 'hello', ctx());
    expect(fs.move('a.txt', 'b.txt', ctx()).ok).toBe(true);
    expect(fs.stat('a.txt', ctx()).ok).toBe(false);
    expect(fs.copy('b.txt', 'c.txt', ctx()).ok).toBe(true);
    const c = fs.readText('c.txt', ctx());
    if (c.ok) expect(c.value).toBe('hello');
  });

  it('prevents moving a directory into its own descendant', () => {
    const { fs } = setup();
    fs.createDirectory('a/b', { recursive: true }, ctx());
    const result = fs.move('a', 'a/b/a', ctx());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('fs/invalid-move');
  });

  it('enforces write permission on read-only directories', () => {
    const { fs } = setup();
    const result = fs.createFile('/usr/examples/x.txt', {}, ctx());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('fs/permission-denied');
  });

  it('reports a helpful error for a missing file', () => {
    const { fs } = setup();
    const result = fs.readText('nope.txt', ctx());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('fs/not-found');
      expect(result.error.hint).toBeDefined();
    }
  });
});

describe('FileSystem — events', () => {
  it('emits filesystem events for mutations', () => {
    const { fs, recorder } = setup(true);
    fs.createDirectory('demos', {}, ctx());
    fs.createFile('demos/hello.asm', {}, ctx());
    fs.writeText('demos/hello.asm', 'x', ctx());
    const types = recorder!.getEvents().map((e) => e.type);
    expect(types).toContain('filesystem.directory.created');
    expect(types).toContain('filesystem.file.created');
    expect(types).toContain('filesystem.file.written');
  });
});

describe('FileSystem — snapshot/restore + persistence', () => {
  it('round-trips through a snapshot', () => {
    const { fs } = setup();
    fs.createDirectory('demos', {}, ctx());
    fs.writeText('demos/hello.asm', 'MOV R0, 5\n', ctx());
    const snap = fs.snapshot();

    const clock = createSimulationClock();
    const restored = createFileSystem({ clock });
    expect(restored.restore(snap).ok).toBe(true);
    const text = restored.readText('demos/hello.asm', ctx());
    if (!text.ok) throw new Error(text.error.message);
    expect(text.value).toBe('MOV R0, 5\n');
  });

  it('persists and reloads through a storage provider', async () => {
    const { fs } = setup();
    fs.writeText('persist.txt', 'kept', ctx());
    const provider = createInMemoryStorageProvider();
    await provider.save(fs.snapshot());

    const loaded = await provider.load();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok || loaded.value === null) throw new Error('expected snapshot');

    const clock = createSimulationClock();
    const restored = createFileSystem({ clock });
    restored.restore(loaded.value);
    const text = restored.readText('persist.txt', ctx());
    if (text.ok) expect(text.value).toBe('kept');
  });
});
