import type { Result, ProcessId, DeterministicRandom, SimulationClock } from '@novaos/shared';
import { ok, err, novaError, createSeededRandom } from '@novaos/shared';
import type {
  AddressConfig,
  AddressGeometry,
  VirtualAddress,
  PhysicalAddress,
  Vpn,
} from './address';
import {
  createAddressGeometry,
  decodeVirtualAddress,
  composePhysicalAddress,
  asVpn,
  asPfn,
} from './address';
import type { PageTable, PagePermissions } from './page-table';
import { createPageTable } from './page-table';
import type { PhysicalFrameTable } from './frames';
import { createFrameTable } from './frames';
import type { ReplacementPolicy, ReplacementPolicyId, ReplacementContext } from './replacement';
import { createReplacementPolicy } from './replacement';
import type { Tlb, TlbEvictionId } from './tlb';
import { createTlb } from './tlb';
import type { MmuSnapshot, TranslationTrace, TranslationStep } from './snapshot';

export type AccessKind = 'read' | 'write' | 'execute';

export interface AccessRequest {
  readonly pid: ProcessId;
  readonly address: VirtualAddress;
  readonly kind: AccessKind;
}

export interface TranslationResult {
  readonly physicalAddress: PhysicalAddress;
  readonly frame: number;
  readonly source: 'tlb' | 'page-table' | 'fault-serviced';
  readonly fault?: PageFaultOutcome;
  readonly trace: TranslationTrace;
}

export interface PageFaultOutcome {
  readonly vpn: number;
  readonly loadedFrame: number;
  readonly evicted: { pid: number; vpn: number; frame: number; wasDirty: boolean } | null;
  readonly policyId: ReplacementPolicyId;
}

export interface MmuConfig {
  readonly address: AddressConfig;
  readonly replacementId: ReplacementPolicyId;
  readonly tlb: { enabled: boolean; capacity: number; evictionId: TlbEvictionId };
  readonly seed: number;
}

export interface MmuDeps {
  readonly clock: SimulationClock;
  readonly random?: DeterministicRandom;
}

export interface Mmu {
  readonly geometry: AddressGeometry;
  readonly replacementId: ReplacementPolicyId;
  addressSpace(pid: ProcessId, permissions?: (vpn: Vpn) => PagePermissions): PageTable;
  dropAddressSpace(pid: ProcessId): void;
  translate(request: AccessRequest): Result<TranslationResult>;
  handleFault(pid: ProcessId, vpn: Vpn): Result<PageFaultOutcome>;
  frames(): PhysicalFrameTable;
  tlb(): Tlb;
  pageTable(pid: ProcessId): PageTable | undefined;
  snapshot(): MmuSnapshot;
  restore(snapshot: MmuSnapshot): Result<void>;
}

const allowed = (perms: PagePermissions, kind: AccessKind): boolean =>
  kind === 'read' ? perms.read : kind === 'write' ? perms.write : perms.execute;

export function createMmu(config: MmuConfig, deps: MmuDeps): Result<Mmu> {
  const geo = createAddressGeometry(config.address);
  if (!geo.ok) return geo;
  const geometry = geo.value;

  const clock = deps.clock;
  const random = deps.random ?? createSeededRandom(config.seed);
  const frames = createFrameTable(geometry.frameCount);
  const replacement: ReplacementPolicy = createReplacementPolicy(config.replacementId);
  const tlb = createTlb(config.tlb);
  const pageTables = new Map<number, PageTable>();
  let lastTranslation: TranslationTrace | null = null;

  const permsFactory = new Map<number, (vpn: Vpn) => PagePermissions>();

  const getOrCreate = (pid: ProcessId): PageTable => {
    const key = pid as number;
    const existing = pageTables.get(key);
    if (existing) return existing;
    const perms = permsFactory.get(key);
    const table = createPageTable(perms ? { pid, permissions: perms } : { pid });
    pageTables.set(key, table);
    return table;
  };

  const replacementCtx = (): ReplacementContext => ({
    frames,
    pageTableOf: (pid) => pageTables.get(pid),
    random,
    tick: clock.now() as number,
  });

  function handleFault(pid: ProcessId, vpn: Vpn): Result<PageFaultOutcome> {
    const table = getOrCreate(pid);
    const perms = table.entry(vpn).permissions;
    let frame = frames.allocate({ pid, vpn });
    let evicted: PageFaultOutcome['evicted'] = null;

    if (frame === null) {
      const victim = replacement.selectVictim(replacementCtx());
      const victimTable = pageTables.get(victim.pid);
      const wasDirty = victimTable?.entry(victim.vpn).dirty ?? false;
      victimTable?.unmap(victim.vpn);
      tlb.invalidate(victim.pid, victim.vpn);
      replacement.onEvict(victim);
      frames.free(victim.frame);
      evicted = {
        pid: victim.pid,
        vpn: victim.vpn as number,
        frame: victim.frame as number,
        wasDirty,
      };
      frame = frames.allocate({ pid, vpn });
    }

    if (frame === null) {
      return err(
        novaError({
          code: 'mmu/no-frame',
          severity: 'fatal',
          message: 'Frame allocation failed after eviction (should be unreachable).',
        }),
      );
    }

    table.map(vpn, frame, perms);
    const mapped = table.entry(vpn);
    mapped.loadedAtTick = clock.now() as number;
    replacement.onLoad({ frame, pid: pid as number, vpn });

    return ok({
      vpn: vpn as number,
      loadedFrame: frame as number,
      evicted,
      policyId: config.replacementId,
    });
  }

  function translate(request: AccessRequest): Result<TranslationResult> {
    const { pid, address, kind } = request;
    const decoded = decodeVirtualAddress(geometry, address);
    const steps: TranslationStep[] = [];

    if (!decoded.ok) {
      lastTranslation = {
        pid: pid as number,
        virtualAddress: address as number,
        vpn: -1,
        offset: -1,
        frame: null,
        physicalAddress: null,
        steps: [
          {
            stage: 'decode',
            label: 'Virtual address out of range',
            detail: { virtualAddress: address as number },
          },
        ],
      };
      return decoded;
    }

    const { vpn, offset } = decoded.value;
    steps.push({
      stage: 'decode',
      label: `VA → VPN ${vpn as number}, offset ${offset}`,
      detail: { vpn: vpn as number, offset, pageSize: geometry.config.pageSizeBytes },
    });

    const table = getOrCreate(pid);
    const tick = clock.now() as number;
    const tlbResult = tlb.lookup(pid as number, vpn, tick);

    let frame: number;
    let source: TranslationResult['source'];
    let fault: PageFaultOutcome | undefined;

    if (tlbResult.hit && tlbResult.frame !== null) {
      steps.push({
        stage: 'tlb-hit',
        label: `TLB hit → frame ${tlbResult.frame as number}`,
        detail: { frame: tlbResult.frame as number },
      });
      frame = tlbResult.frame as number;
      source = 'tlb';
    } else {
      steps.push({ stage: 'tlb-miss', label: 'TLB miss — walking the page table', detail: {} });
      const pte = table.entry(vpn);

      if (!allowed(pte.permissions, kind)) {
        steps.push({
          stage: 'protection-fault',
          label: `Protection fault: ${kind} not permitted`,
          detail: {
            read: pte.permissions.read,
            write: pte.permissions.write,
            execute: pte.permissions.execute,
          },
        });
        lastTranslation = {
          pid: pid as number,
          virtualAddress: address as number,
          vpn: vpn as number,
          offset,
          frame: null,
          physicalAddress: null,
          steps,
        };
        return err(
          novaError({
            code: 'mmu/protection-fault',
            severity: 'recoverable',
            message: `${kind} access to VPN ${vpn as number} violates page permissions.`,
          }),
        );
      }

      if (!pte.present) {
        const serviced = handleFault(pid, vpn);
        if (!serviced.ok) return serviced;
        fault = serviced.value;
        steps.push({
          stage: 'page-fault-serviced',
          label: `Page fault serviced → frame ${fault.loadedFrame}${
            fault.evicted ? ` (evicted P${fault.evicted.pid}:V${fault.evicted.vpn})` : ''
          }`,
          detail: {
            loadedFrame: fault.loadedFrame,
            evictedFrame: fault.evicted?.frame ?? null,
            evictedWasDirty: fault.evicted?.wasDirty ?? null,
            policy: fault.policyId,
          },
        });
        source = 'fault-serviced';
      } else {
        steps.push({
          stage: 'pte-hit',
          label: `PTE present → frame ${pte.frame as number}`,
          detail: { frame: pte.frame as number },
        });
        source = 'page-table';
      }
      const resolved = table.entry(vpn);
      frame = resolved.frame as number;
    }

    // Update access bits + TLB (steps 6-7).
    const pte = table.entry(vpn);
    pte.referenced = true;
    pte.referencedAtTick = clock.now() as number;
    if (kind === 'write') pte.dirty = true;
    tlb.insert(pid as number, vpn, asPfn(frame), tick);

    const physicalAddress = composePhysicalAddress(geometry, asPfn(frame), offset);
    steps.push({
      stage: 'compose',
      label: `PA = frame ${frame} × ${geometry.config.pageSizeBytes} + ${offset} = ${physicalAddress as number}`,
      detail: { frame, offset, physicalAddress: physicalAddress as number },
    });

    lastTranslation = {
      pid: pid as number,
      virtualAddress: address as number,
      vpn: vpn as number,
      offset,
      frame,
      physicalAddress: physicalAddress as number,
      steps,
    };

    clock.tick(1);
    return ok({
      physicalAddress,
      frame,
      source,
      ...(fault ? { fault } : {}),
      trace: lastTranslation,
    });
  }

  const mmu: Mmu = {
    geometry,
    replacementId: config.replacementId,
    addressSpace(pid, permissions) {
      if (permissions) permsFactory.set(pid as number, permissions);
      return getOrCreate(pid);
    },
    dropAddressSpace(pid) {
      const table = pageTables.get(pid as number);
      if (table) {
        for (const e of table.entries()) {
          if (e.present && e.frame !== null) {
            replacement.onEvict({ frame: e.frame, pid: pid as number, vpn: e.vpn });
            frames.free(e.frame);
          }
          tlb.invalidate(pid as number, e.vpn);
        }
      }
      pageTables.delete(pid as number);
      permsFactory.delete(pid as number);
    },
    translate,
    handleFault,
    frames: () => frames,
    tlb: () => tlb,
    pageTable: (pid) => pageTables.get(pid as number),
    snapshot() {
      return {
        version: 1,
        config: config.address,
        replacementId: config.replacementId,
        randomState: random.getState(),
        tick: clock.now() as number,
        frames: frames.snapshot(),
        replacement: replacement.snapshot(),
        tlb: tlb.snapshot(),
        pageTables: [...pageTables.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([, t]) => t.snapshot()),
        lastTranslation,
      };
    },
    restore(snapshot) {
      random.setState(snapshot.randomState);
      clock.reset();
      clock.tick(snapshot.tick);
      frames.restore(snapshot.frames);
      replacement.restore(snapshot.replacement);
      tlb.restore(snapshot.tlb);
      pageTables.clear();
      for (const pts of snapshot.pageTables) {
        const table = getOrCreate(pts.pid as unknown as ProcessId);
        table.restore(pts);
      }
      lastTranslation = snapshot.lastTranslation;
      return ok(undefined);
    },
  };

  return ok(mmu);
}

export { asVpn };
