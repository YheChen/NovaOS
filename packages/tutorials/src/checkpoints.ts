import type { ProgramRunner } from '@novaos/simulator';
import { createSimulationClock, processId } from '@novaos/shared';
import { createMmu, asVirtualAddress } from '@novaos/mmu';
import type { Checkpoint, MmuCheckpointConfig, MmuAccess } from './types';

/** Thin constructor helpers so the dataset reads cleanly. */
export const expectedOutput = (id: string, description: string, value: string): Checkpoint => ({
  kind: 'expected-output',
  id,
  description,
  value,
});
export const compilesClean = (id: string, description: string): Checkpoint => ({
  kind: 'compiles-clean',
  id,
  description,
});
export const hasDiagnostic = (
  id: string,
  description: string,
  severity: 'error' | 'warning' | 'info',
): Checkpoint => ({ kind: 'has-diagnostic', id, description, severity });
export const mmuTranslate = (
  id: string,
  description: string,
  config: MmuCheckpointConfig,
  accesses: readonly MmuAccess[],
): Checkpoint => ({ kind: 'mmu-translate', id, description, config, accesses });

export interface CheckpointResult {
  readonly checkpointId: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface VerifyContext {
  readonly runner: ProgramRunner;
  /** Present for program checkpoints; ignored by self-contained kinds like mmu-translate. */
  readonly fileName?: string;
  readonly source?: string;
}

function verifyMmuTranslate(cp: Extract<Checkpoint, { kind: 'mmu-translate' }>): CheckpointResult {
  const built = createMmu(
    {
      address: {
        pageSizeBytes: cp.config.pageSizeBytes,
        virtualAddressBits: cp.config.virtualAddressBits,
        physicalAddressBits: cp.config.physicalAddressBits,
      },
      replacementId: cp.config.replacementId,
      tlb: { enabled: false, capacity: 1, evictionId: 'fifo' },
      seed: cp.config.seed,
    },
    { clock: createSimulationClock() },
  );
  if (!built.ok) {
    return {
      checkpointId: cp.id,
      passed: false,
      detail: `invalid MMU config: ${built.error.message}`,
    };
  }
  const mmu = built.value;
  const pid = processId(1);
  mmu.addressSpace(pid);

  for (let i = 0; i < cp.accesses.length; i += 1) {
    const a = cp.accesses[i] as MmuAccess;
    const r = mmu.translate({ pid, address: asVirtualAddress(a.address), kind: a.kind });
    if (a.expectFault) {
      if (r.ok) {
        return {
          checkpointId: cp.id,
          passed: false,
          detail: `access ${i} expected a fault but succeeded`,
        };
      }
      continue;
    }
    if (!r.ok) {
      return {
        checkpointId: cp.id,
        passed: false,
        detail: `access ${i} faulted: ${r.error.message}`,
      };
    }
    const pa = Number(r.value.physicalAddress);
    if (a.expectPhysical !== undefined && pa !== a.expectPhysical) {
      return {
        checkpointId: cp.id,
        passed: false,
        detail: `access ${i}: PA ${pa} ≠ expected ${a.expectPhysical}`,
      };
    }
  }
  return {
    checkpointId: cp.id,
    passed: true,
    detail: `${cp.accesses.length} translation(s) matched`,
  };
}

/**
 * Verify one checkpoint by driving the real `ProgramRunner`. Pure with respect
 * to the runner (deterministic compile/run), so the integrity test and the web
 * "Check" button call the exact same function — no drift between what the test
 * asserts and what the user sees.
 */
export function verifyCheckpoint(cp: Checkpoint, ctx: VerifyContext): CheckpointResult {
  const fileName = ctx.fileName ?? '';
  const source = ctx.source ?? '';
  switch (cp.kind) {
    case 'expected-output': {
      const report = ctx.runner.run(fileName, source);
      if (!report.ok) {
        return { checkpointId: cp.id, passed: false, detail: 'Program failed to compile/run.' };
      }
      const got = report.output.trim();
      return {
        checkpointId: cp.id,
        passed: got === cp.value,
        detail: got === cp.value ? `output = ${got}` : `got "${got}", expected "${cp.value}"`,
      };
    }
    case 'compiles-clean': {
      const report = ctx.runner.compile(fileName, source);
      const errors = report.diagnostics.filter((d) => d.severity === 'error');
      return {
        checkpointId: cp.id,
        passed: report.ok && errors.length === 0,
        detail: errors.length === 0 ? 'compiled cleanly' : `${errors.length} error(s)`,
      };
    }
    case 'has-diagnostic': {
      const report = ctx.runner.compile(fileName, source);
      const matches = report.diagnostics.filter((d) => d.severity === cp.severity);
      return {
        checkpointId: cp.id,
        passed: matches.length > 0,
        detail:
          matches.length > 0
            ? `${matches.length} ${cp.severity} diagnostic(s)`
            : `no ${cp.severity} diagnostic produced`,
      };
    }
    case 'mmu-translate':
      return verifyMmuTranslate(cp);
  }
}
