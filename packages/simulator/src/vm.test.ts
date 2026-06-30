import { describe, it, expect } from 'vitest';
import { Opcode } from '@novaos/cpu';
import { expectEvents } from '@novaos/testing';
import { buildProgram } from './program';
import { createVirtualMachine } from './vm';

// The Milestone 1 flagship demo:
//   MOV R0, 5
//   MOV R1, 10
//   ADD R2, R0, R1
//   PRINT R2
//   HALT
const demoProgram = () =>
  buildProgram([
    { opcode: Opcode.MOV, a: 0, b: 5 },
    { opcode: Opcode.MOV, a: 1, b: 10 },
    { opcode: Opcode.ADD, a: 2, b: 0, c: 1 },
    { opcode: Opcode.PRINT, a: 2 },
    { opcode: Opcode.HALT },
  ]);

describe('VirtualMachine — demo program', () => {
  it('runs to HALT and prints 15', () => {
    const vm = createVirtualMachine({ program: demoProgram() });
    const result = vm.run();

    expect(result.status).toBe('halted');
    expect(vm.getStatus()).toBe('halted');
    expect(vm.getOutput()).toBe('15\n');
    expect(vm.getOutputLines()).toEqual(['15']);
    expect(vm.getRegisters().r2).toBe(15);
    expect(vm.getRegisters().r0).toBe(5);
    expect(vm.getRegisters().r1).toBe(10);
  });

  it('emits the expected deterministic event sequence', () => {
    const vm = createVirtualMachine({ program: demoProgram() });
    vm.run();
    expectEvents(vm.getEvents()).toEqualSequence([
      'runtime.program.loaded',
      'cpu.instruction.fetched',
      'cpu.register.changed',
      'cpu.instruction.executed',
      'cpu.instruction.fetched',
      'cpu.register.changed',
      'cpu.instruction.executed',
      'cpu.instruction.fetched',
      'cpu.register.changed',
      'cpu.instruction.executed',
      'cpu.instruction.fetched',
      'cpu.output',
      'cpu.instruction.executed',
      'cpu.instruction.fetched',
      'cpu.halted',
      'runtime.halted',
    ]);
  });

  it('is deterministic: two runs produce identical events and final state', () => {
    const first = createVirtualMachine({ program: demoProgram() });
    first.run();
    const second = createVirtualMachine({ program: demoProgram() });
    second.run();

    expect(second.getEvents()).toEqual(first.getEvents());
    expect(second.getRegisters()).toEqual(first.getRegisters());
    expect(second.getOutput()).toBe(first.getOutput());
  });

  it('steps one instruction at a time', () => {
    const vm = createVirtualMachine({ program: demoProgram() });
    vm.step(); // MOV R0, 5
    expect(vm.getRegisters().r0).toBe(5);
    expect(vm.getStatus()).toBe('running');
    expect(vm.getRegisters().pc).toBe(4);
  });
});

describe('VirtualMachine — faults', () => {
  it('faults on an invalid opcode and stops', () => {
    const program = buildProgram([{ opcode: 0x42 }, { opcode: Opcode.HALT }]);
    const vm = createVirtualMachine({ program });
    const result = vm.run();
    expect(result.status).toBe('faulted');
    expect(vm.getStatus()).toBe('faulted');
    const types = vm.getEvents().map((e) => e.type);
    expect(types).toContain('cpu.fault.raised');
    expect(types).toContain('runtime.faulted');
  });
});
