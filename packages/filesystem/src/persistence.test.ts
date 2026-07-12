import { describe, it, expect } from 'vitest';
import { createSimulationClock } from '@novaos/shared';
import { createFileSystem, fsContext } from './filesystem';
import { absolutePath } from './ids';
import {
  toPersisted,
  fromPersisted,
  PERSISTED_ENVELOPE_VERSION,
  createInMemoryStorageProvider,
} from './persistence';

function freshFs() {
  return createFileSystem({ clock: createSimulationClock() });
}
const ctx = fsContext(absolutePath('/'));

describe('persistence envelope', () => {
  it('wraps a snapshot with the current envelope version', () => {
    const snap = freshFs().snapshot();
    const wrapped = toPersisted(snap);
    expect(wrapped.envelopeVersion).toBe(PERSISTED_ENVELOPE_VERSION);
    expect(wrapped.payload).toBe(snap);
  });

  it('round-trips toPersisted → fromPersisted', () => {
    const snap = freshFs().snapshot();
    const back = fromPersisted(toPersisted(snap));
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.value).toEqual(snap);
  });

  it('rejects malformed envelopes with typed errors', () => {
    const notObject = fromPersisted(42);
    expect(notObject.ok).toBe(false);
    if (!notObject.ok) expect(notObject.error.code).toBe('fs/snapshot-corrupt');

    const wrongVersion = fromPersisted({ envelopeVersion: 999, payload: { version: 1 } });
    expect(wrongVersion.ok).toBe(false);
    if (!wrongVersion.ok) expect(wrongVersion.error.code).toBe('fs/snapshot-version');

    const noPayload = fromPersisted({ envelopeVersion: PERSISTED_ENVELOPE_VERSION });
    expect(noPayload.ok).toBe(false);
    if (!noPayload.ok) expect(noPayload.error.code).toBe('fs/snapshot-corrupt');
  });
});

describe('full filesystem round-trip through the envelope', () => {
  it('survives JSON transport and restores into a fresh filesystem', () => {
    const fs = freshFs();
    fs.createDirectory('/data', { recursive: true }, ctx);
    fs.writeText('/data/hello.txt', 'hi there', ctx);
    fs.writeFile('/data/bin', new Uint8Array([1, 2, 3, 255]), ctx);

    // Prove structured-clone / JSON safety by stringifying and parsing.
    const wire = JSON.parse(JSON.stringify(toPersisted(fs.snapshot()))) as unknown;
    const decoded = fromPersisted(wire);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;

    const restored = freshFs();
    const result = restored.restore(decoded.value);
    expect(result.ok).toBe(true);

    expect(restored.readText('/data/hello.txt', ctx)).toEqual({ ok: true, value: 'hi there' });
    const bin = restored.readFile('/data/bin', ctx);
    expect(bin.ok).toBe(true);
    if (bin.ok) expect(Array.from(bin.value)).toEqual([1, 2, 3, 255]);
  });

  it('persists a snapshot through the in-memory storage provider', async () => {
    const fs = freshFs();
    fs.createDirectory('/tmp', { recursive: true }, ctx);
    fs.writeText('/tmp/a', 'A', ctx);
    const provider = createInMemoryStorageProvider();
    await provider.save(fs.snapshot());

    const loaded = await provider.load();
    expect(loaded.ok).toBe(true);
    if (loaded.ok && loaded.value) {
      const restored = freshFs();
      restored.restore(loaded.value);
      expect(restored.readText('/tmp/a', ctx)).toEqual({ ok: true, value: 'A' });
    }
  });
});
