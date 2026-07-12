import type { Result, ProcessId } from '@novaos/shared';
import { ok } from '@novaos/shared';
import type { Vpn, Pfn } from './address';
import { asVpn, asPfn } from './address';

export interface PagePermissions {
  readonly read: boolean;
  readonly write: boolean;
  readonly execute: boolean;
}

export interface PageTableEntry {
  readonly vpn: Vpn;
  present: boolean;
  dirty: boolean;
  referenced: boolean;
  frame: Pfn | null;
  readonly permissions: PagePermissions;
  loadedAtTick: number | null;
  referencedAtTick: number | null;
}

export interface PageTableSnapshot {
  readonly pid: number;
  readonly entries: readonly PageTableEntry[];
}

export interface PageTable {
  readonly pid: ProcessId;
  /** Return the PTE for a VPN, creating a not-present entry on first touch. */
  entry(vpn: Vpn): PageTableEntry;
  /** All entries that have ever been touched, sorted by VPN. */
  entries(): readonly PageTableEntry[];
  /** Map/replace a VPN onto a frame and mark it present. */
  map(vpn: Vpn, frame: Pfn, permissions: PagePermissions): void;
  /** Invalidate a VPN (used by replacement to evict a victim page). */
  unmap(vpn: Vpn): void;
  snapshot(): PageTableSnapshot;
  restore(snapshot: PageTableSnapshot): Result<void>;
}

export interface CreatePageTableOptions {
  readonly pid: ProcessId;
  readonly permissions?: (vpn: Vpn) => PagePermissions;
}

export function defaultPagePermissions(): PagePermissions {
  return { read: true, write: true, execute: false };
}

function cloneEntry(e: PageTableEntry): PageTableEntry {
  return { ...e, permissions: { ...e.permissions } };
}

export function createPageTable(options: CreatePageTableOptions): PageTable {
  const permsFor = options.permissions ?? (() => defaultPagePermissions());
  const table = new Map<number, PageTableEntry>();

  const freshEntry = (vpn: Vpn): PageTableEntry => ({
    vpn,
    present: false,
    dirty: false,
    referenced: false,
    frame: null,
    permissions: permsFor(vpn),
    loadedAtTick: null,
    referencedAtTick: null,
  });

  const sorted = (): PageTableEntry[] =>
    [...table.values()].sort((a, b) => (a.vpn as number) - (b.vpn as number));

  return {
    pid: options.pid,
    entry(vpn) {
      const key = vpn as number;
      const existing = table.get(key);
      if (existing) return existing;
      const created = freshEntry(vpn);
      table.set(key, created);
      return created;
    },
    entries: () => sorted().map(cloneEntry),
    map(vpn, frame, permissions) {
      const key = vpn as number;
      const e = table.get(key) ?? freshEntry(vpn);
      table.set(key, {
        ...e,
        present: true,
        frame,
        permissions,
      });
    },
    unmap(vpn) {
      const e = table.get(vpn as number);
      if (!e) return;
      table.set(vpn as number, { ...e, present: false, frame: null, dirty: false });
    },
    snapshot() {
      return { pid: options.pid as number, entries: sorted().map(cloneEntry) };
    },
    restore(snapshot) {
      table.clear();
      for (const e of snapshot.entries) {
        table.set(e.vpn as number, {
          ...cloneEntry(e),
          vpn: asVpn(e.vpn as number),
          frame: e.frame === null ? null : asPfn(e.frame as number),
        });
      }
      return ok(undefined);
    },
  };
}
