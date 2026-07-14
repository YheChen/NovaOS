import { describe, it, expect } from 'vitest';
import { asAddress } from '@novaos/shared';
import { createMemory } from '@novaos/memory';
import { compileToyC } from '@novaos/compiler';
import { createIdentityPaging, createTranslatingMemory } from './paging';
import { createProgramRunner } from './runner';
import { createNovaRuntime } from './runtime';
import type { ProgramImage } from './program';

const HELLO = `int main() {
  int a = 5;
  int b = 10;
  print(a + b);
  return 0;
}`;

function compile(source: string): ProgramImage {
  const result = compileToyC(source, { fileName: 'hello.c' });
  if (!result.bytecode) throw new Error('compile failed');
  return { code: result.bytecode.code, entryPoint: result.bytecode.entryPoint };
}

describe('identity paging translator', () => {
  it('maps a virtual address to the same physical address', () => {
    const t = createIdentityPaging({ ramBytes: 65536, pageSizeBytes: 256 });
    const r = t.translate(0x1234); // VPN 0x12, offset 0x34 → identity → 0x1234
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(0x1234);
  });

  it('faults on an out-of-range virtual address', () => {
    const t = createIdentityPaging({ ramBytes: 4096, pageSizeBytes: 256 });
    const r = t.translate(999999);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('mmu/segfault');
    expect(t.stats().faults).toBe(1);
  });

  it('counts translations and records TLB hits on repeat access', () => {
    const t = createIdentityPaging({ ramBytes: 65536, pageSizeBytes: 256, tlbCapacity: 8 });
    t.translate(0x1000); // page 0x10, miss
    t.translate(0x1004); // same page, hit
    t.translate(0x1008); // same page, hit
    const s = t.stats();
    expect(s.translations).toBe(3);
    expect(s.tlbHits).toBe(2);
    expect(s.tlbMisses).toBe(1);
  });
});

describe('translating memory', () => {
  it('round-trips a word through the identity translation', () => {
    const memory = createMemory(4096);
    const translated = createTranslatingMemory(memory, createIdentityPaging({ ramBytes: 4096 }));
    expect(translated.writeWord(asAddress(0x40), 0xcafe).ok).toBe(true);
    const read = translated.readWord(asAddress(0x40));
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.value).toBe(0xcafe);
    // The write landed at the identical physical address in the real memory.
    const direct = memory.readWord(asAddress(0x40));
    expect(direct.ok && direct.value).toBe(0xcafe);
  });
});

describe('CPU accesses routed through the MMU (end-to-end)', () => {
  it('produces the same output as without paging', () => {
    const plain = createProgramRunner().run('hello.c', HELLO);
    const runtime = createNovaRuntime({ paging: true });
    runtime.boot();
    runtime.spawn('hello', compile(HELLO));
    runtime.run();
    expect(runtime.getOutput().trim()).toBe(plain.output.trim());
    expect(runtime.getOutput().trim()).toBe('15');
  });

  it('actually walked the MMU: translations and TLB hits are recorded', () => {
    const runtime = createNovaRuntime({ paging: { pageSizeBytes: 256, tlbCapacity: 16 } });
    runtime.boot();
    runtime.spawn('hello', compile(HELLO));
    runtime.run();
    const stats = runtime.getTranslationStats();
    expect(stats).not.toBeNull();
    expect(stats?.translations).toBeGreaterThan(0);
    expect(stats?.tlbHits).toBeGreaterThan(0);
    expect(stats?.faults).toBe(0);
  });

  it('reports null translation stats when paging is off', () => {
    expect(createNovaRuntime().getTranslationStats()).toBeNull();
  });
});
