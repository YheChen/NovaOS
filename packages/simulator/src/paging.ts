import { ok, err, novaError, asAddress, type Result } from '@novaos/shared';
import type { MemoryPort } from '@novaos/cpu';
import {
  createAddressGeometry,
  decodeVirtualAddress,
  composePhysicalAddress,
  asVirtualAddress,
  asPfn,
  createTlb,
} from '@novaos/mmu';

export interface TranslationStats {
  readonly translations: number;
  readonly tlbHits: number;
  readonly tlbMisses: number;
  readonly faults: number;
}

/**
 * Translates the CPU's addresses on the fetch/load/store path. It walks a page
 * table (with a TLB) using `@novaos/mmu`'s addressing math, then hands the
 * resolved physical address to the real memory.
 */
export interface AddressTranslator {
  translate(address: number): Result<number>;
  stats(): TranslationStats;
}

export interface PagingConfig {
  readonly ramBytes: number;
  /** Page size in bytes (power of two). Defaults to 256. */
  readonly pageSizeBytes?: number;
  /** TLB capacity; 0 disables the TLB. Defaults to 16. */
  readonly tlbCapacity?: number;
}

const PID = 0;

/**
 * An identity-mapped MMU over the whole RAM: virtual page N maps to physical
 * frame N, so translation is transparent (physical === virtual) while every CPU
 * access still walks the page table + TLB — the mechanism you'd extend to a
 * non-identity mapping. Out-of-range virtual addresses fault (a "segfault").
 */
export function createIdentityPaging(config: PagingConfig): AddressTranslator {
  const pageSizeBytes = config.pageSizeBytes ?? 256;
  const bits = Math.max(1, Math.ceil(Math.log2(config.ramBytes)));
  const geometry = createAddressGeometry({
    pageSizeBytes,
    virtualAddressBits: bits,
    physicalAddressBits: bits,
  });
  if (!geometry.ok) {
    throw new Error(`Invalid paging geometry: ${geometry.error.message}`);
  }
  const geo = geometry.value;
  const capacity = config.tlbCapacity ?? 16;
  const tlb = createTlb({
    enabled: capacity > 0,
    capacity: Math.max(1, capacity),
    evictionId: 'lru',
  });

  let translations = 0;
  let faults = 0;
  let tick = 0;

  return {
    translate(address) {
      translations += 1;
      const decoded = decodeVirtualAddress(geo, asVirtualAddress(address));
      if (!decoded.ok) {
        faults += 1;
        return err(
          novaError({
            code: 'mmu/segfault',
            severity: 'recoverable',
            message: `Virtual address ${address} is outside the mapped address space.`,
          }),
        );
      }
      const { vpn, offset } = decoded.value;
      tick += 1;
      const hit = tlb.lookup(PID, vpn, tick);
      const pfn = hit.hit && hit.frame !== null ? hit.frame : asPfn(vpn as number); // identity
      if (!hit.hit) tlb.insert(PID, vpn, pfn, tick);
      return ok(composePhysicalAddress(geo, pfn, offset) as number);
    },
    stats() {
      const s = tlb.stats();
      return { translations, tlbHits: s.hits, tlbMisses: s.misses, faults };
    },
  };
}

/**
 * A demand-paged MMU with a *per-process* page table. Pages start not-present;
 * the first access to a page by a process takes a page fault, which maps it in
 * (identity frame, so physical === virtual and the address integrates with the
 * kernel's layout). Each process (`getPid()`) has its own resident set, and the
 * TLB is flushed on every address-space switch — so context switches cost
 * misses, exactly as on real hardware. `faults` counts real demand faults.
 */
export function createDemandPager(
  config: PagingConfig,
  getPid: () => number | null,
): AddressTranslator {
  const pageSizeBytes = config.pageSizeBytes ?? 256;
  const bits = Math.max(1, Math.ceil(Math.log2(config.ramBytes)));
  const geometry = createAddressGeometry({
    pageSizeBytes,
    virtualAddressBits: bits,
    physicalAddressBits: bits,
  });
  if (!geometry.ok) {
    throw new Error(`Invalid paging geometry: ${geometry.error.message}`);
  }
  const geo = geometry.value;
  const capacity = config.tlbCapacity ?? 16;
  const tlb = createTlb({
    enabled: capacity > 0,
    capacity: Math.max(1, capacity),
    evictionId: 'lru',
  });

  // Per-process resident sets: which virtual pages this process has faulted in.
  const resident = new Map<number, Set<number>>();
  let translations = 0;
  let faults = 0;
  let tick = 0;
  let lastPid: number | null = null;

  return {
    translate(address) {
      translations += 1;
      const decoded = decodeVirtualAddress(geo, asVirtualAddress(address));
      if (!decoded.ok) {
        faults += 1;
        return err(
          novaError({
            code: 'mmu/segfault',
            severity: 'recoverable',
            message: `Virtual address ${address} is outside the mapped address space.`,
          }),
        );
      }
      const { vpn, offset } = decoded.value;
      const pid = getPid() ?? 0;
      if (pid !== lastPid) {
        tlb.flush(); // address-space switch invalidates the TLB
        lastPid = pid;
      }
      tick += 1;
      let pages = resident.get(pid);
      if (!pages) {
        pages = new Set();
        resident.set(pid, pages);
      }
      const hit = tlb.lookup(pid, vpn, tick);
      if (!(hit.hit && hit.frame !== null)) {
        if (!pages.has(vpn)) {
          pages.add(vpn); // demand-page it in
          faults += 1;
        }
        tlb.insert(pid, vpn, asPfn(vpn as number), tick);
      }
      return ok(composePhysicalAddress(geo, asPfn(vpn as number), offset) as number);
    },
    stats() {
      const s = tlb.stats();
      return { translations, tlbHits: s.hits, tlbMisses: s.misses, faults };
    },
  };
}

/**
 * Wrap a `MemoryPort` so every access is first translated by `translator`. A
 * translation fault surfaces as an `err` Result, which the CPU handles as a
 * memory fault. Identity translation makes this byte-for-byte transparent.
 */
export function createTranslatingMemory(
  memory: MemoryPort,
  translator: AddressTranslator,
): MemoryPort {
  return {
    readByte(address) {
      const t = translator.translate(address as number);
      return t.ok ? memory.readByte(asAddress(t.value)) : t;
    },
    readWord(address) {
      const t = translator.translate(address as number);
      return t.ok ? memory.readWord(asAddress(t.value)) : t;
    },
    writeWord(address, value) {
      const t = translator.translate(address as number);
      return t.ok ? memory.writeWord(asAddress(t.value), value) : t;
    },
  };
}
