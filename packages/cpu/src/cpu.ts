import { asAddress } from '@novaos/shared';
import { decode } from './decoder';
import { HANDLERS } from './handlers';
import { Opcode, INSTRUCTION_SIZE } from './opcodes';
import { createRegisterFile, type RegisterFileSnapshot, type RegisterName } from './register-file';
import { flagsEqual } from './flags';
import { vmFault, type VmFault } from './faults';
import type { DecodedInstruction } from './instruction';
import type { SyscallTrapResult, VmExecutionContext } from './context';
import * as events from './events';

export type CpuStepStatus = 'ok' | 'halted' | 'fault';

export interface CpuStepResult {
  readonly status: CpuStepStatus;
  readonly cycles: number;
  readonly instruction: DecodedInstruction | null;
  readonly fault: VmFault | null;
  /** Present when the step executed a `SYSCALL`. */
  readonly syscall?: { readonly id: number; readonly outcome: SyscallTrapResult } | null;
}

export interface CpuSnapshot {
  readonly registers: RegisterFileSnapshot;
}

export interface Cpu {
  reset(initial?: Partial<RegisterFileSnapshot>): void;
  getRegisters(): RegisterFileSnapshot;
  setRegister(name: RegisterName, value: number): void;
  getSnapshot(): CpuSnapshot;
  restoreSnapshot(snapshot: CpuSnapshot): void;
  /** Execute exactly one instruction (fetch → decode → execute → write-back → events). */
  step(ctx: VmExecutionContext): CpuStepResult;
}

export function createCpu(): Cpu {
  const registers = createRegisterFile();

  function raise(
    ctx: VmExecutionContext,
    fault: VmFault,
    instruction: DecodedInstruction | null,
  ): CpuStepResult {
    registers.setFlags({ ...registers.getFlags(), exception: true });
    ctx.bus.publish(events.faultEvent(ctx.clock.now(), fault));
    return { status: 'fault', cycles: 1, instruction, fault };
  }

  function step(ctx: VmExecutionContext): CpuStepResult {
    const pc = registers.get('pc');

    // Fetch
    const word = ctx.memory.readWord(asAddress(pc));
    if (!word.ok) {
      return raise(
        ctx,
        vmFault(
          'segmentation-fault',
          pc,
          `Failed to fetch instruction at 0x${pc.toString(16)}: ${word.error.message}`,
        ),
        null,
      );
    }
    registers.set('ir', word.value);
    ctx.bus.publish(events.fetchedEvent(ctx.clock.now(), pc, word.value));

    // Decode
    const decoded = decode(word.value);
    if (!decoded.ok) {
      return raise(ctx, vmFault('invalid-opcode', pc, decoded.error.message), null);
    }
    const instruction = decoded.value;

    // HALT short-circuits before execution (fetched → halted).
    if (instruction.opcode === Opcode.HALT) {
      ctx.bus.publish(events.haltedEvent(ctx.clock.now(), pc));
      return { status: 'halted', cycles: 1, instruction, fault: null };
    }

    // SYSCALL traps to the kernel-provided handler.
    if (instruction.opcode === Opcode.SYSCALL) {
      return executeSyscall(ctx, instruction, pc);
    }

    // Execute
    const effect = HANDLERS[instruction.opcode](instruction, registers.snapshot());
    if (!effect.ok) {
      return raise(ctx, vmFault('invalid-operand', pc, effect.error.message), instruction);
    }

    // Write back register changes, emitting an event only on an actual change.
    for (const write of effect.value.registerWrites) {
      const previous = registers.get(write.name);
      const next = write.value >>> 0;
      if (previous !== next) {
        registers.set(write.name, next);
        ctx.bus.publish(events.registerChangedEvent(ctx.clock.now(), write.name, previous, next));
      }
    }

    // Flags, only when they actually change.
    if (effect.value.flags) {
      const previous = registers.getFlags();
      if (!flagsEqual(previous, effect.value.flags)) {
        registers.setFlags(effect.value.flags);
        ctx.bus.publish(events.flagsChangedEvent(ctx.clock.now(), previous, effect.value.flags));
      }
    }

    // Output
    if (effect.value.output) {
      ctx.output.write(effect.value.output.text);
      ctx.bus.publish(
        events.outputEvent(
          ctx.clock.now(),
          effect.value.output.register,
          effect.value.output.value,
          effect.value.output.text,
        ),
      );
    }

    ctx.bus.publish(events.executedEvent(ctx.clock.now(), pc, instruction));
    registers.set('pc', pc + INSTRUCTION_SIZE);

    return { status: 'ok', cycles: effect.value.cycles, instruction, fault: null };
  }

  function executeSyscall(
    ctx: VmExecutionContext,
    instruction: DecodedInstruction,
    pc: number,
  ): CpuStepResult {
    if (!ctx.syscallTrap) {
      return raise(
        ctx,
        vmFault(
          'invalid-operand',
          pc,
          `SYSCALL ${instruction.a} executed with no handler installed.`,
        ),
        instruction,
      );
    }

    const outcome = ctx.syscallTrap.invoke({
      id: instruction.a,
      registers: registers.snapshot(),
      tick: ctx.clock.now(),
    });

    if (outcome.kind === 'fault') {
      return raise(ctx, vmFault('invalid-operand', pc, outcome.message), instruction);
    }

    if (outcome.kind === 'return') {
      const previous = registers.get('r0');
      const next = outcome.returnValue >>> 0;
      if (previous !== next) {
        registers.set('r0', next);
        ctx.bus.publish(events.registerChangedEvent(ctx.clock.now(), 'r0', previous, next));
      }
      ctx.bus.publish(events.executedEvent(ctx.clock.now(), pc, instruction));
      registers.set('pc', pc + INSTRUCTION_SIZE);
      return {
        status: 'ok',
        cycles: 1,
        instruction,
        fault: null,
        syscall: { id: instruction.a, outcome },
      };
    }

    // outcome.kind === 'exit'
    ctx.bus.publish(events.executedEvent(ctx.clock.now(), pc, instruction));
    registers.set('pc', pc + INSTRUCTION_SIZE);
    return {
      status: 'halted',
      cycles: 1,
      instruction,
      fault: null,
      syscall: { id: instruction.a, outcome },
    };
  }

  return {
    reset: (initial) => registers.reset(initial),
    getRegisters: () => registers.snapshot(),
    setRegister: (name, value) => registers.set(name, value),
    getSnapshot: () => ({ registers: registers.snapshot() }),
    restoreSnapshot: (snapshot) => registers.restore(snapshot.registers),
    step,
  };
}
