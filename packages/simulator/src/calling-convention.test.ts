import { describe, it, expect } from 'vitest';
import { assemble } from '@novaos/assembler';
import { createNovaRuntime } from './runtime';

/**
 * Hand-written NovaASM exercising the Milestone 5 calling convention end to end:
 * a bootstrap `CALL`s `main`, `main` builds a stack frame (PUSH BP / MOVR BP,SP /
 * reserve locals), stores locals via STORE [BP - n], computes, prints via the
 * print syscall, then tears the frame down (MOVR SP,BP / POP BP / RET). This is
 * the contract the Toy C code generator targets.
 */
function runAsm(src: string): { output: string; status: string } {
  const asm = assemble(src, { fileName: 'cc.asm' });
  if (!asm.success || !asm.bytecode) {
    throw new Error(`assemble failed: ${asm.diagnostics.map((d) => d.message).join('; ')}`);
  }
  const rt = createNovaRuntime({ scheduler: 'round-robin', quantumTicks: 8 });
  rt.boot();
  rt.spawn('cc', { entryPoint: asm.bytecode.entryPoint, code: asm.bytecode.code });
  const res = rt.run();
  return { output: rt.getOutput(), status: res.status };
}

describe('Milestone 5 ISA — calling convention', () => {
  it('runs a function call with a stack frame and prints the result', () => {
    const { output } = runAsm(`.global _start

_start:
  CALL main
  HALT

main:
  PUSH BP
  MOVR BP, SP
  LDI R0, 12
  SUB SP, SP, R0
  MOV R0, 5
  STORE R0, BP, -4
  MOV R0, 10
  STORE R0, BP, -8
  LOAD R0, BP, -4
  LOAD R1, BP, -8
  ADD R0, R0, R1
  STORE R0, BP, -12
  LOAD R0, BP, -12
  SYSCALL 0
  MOV R0, 0
  MOVR SP, BP
  POP BP
  RET
`);
    expect(output.trim()).toBe('15');
  });

  it('passes an argument on the stack to a callee (add(5,10))', () => {
    // Caller pushes args right-to-left; callee reads them at [BP + 8 + 4*i];
    // caller cleans up the args after the call (cdecl-style).
    const { output } = runAsm(`.global _start

_start:
  CALL main
  HALT

add:
  PUSH BP
  MOVR BP, SP
  LOAD R0, BP, 8
  LOAD R1, BP, 12
  ADD R0, R0, R1
  MOVR SP, BP
  POP BP
  RET

main:
  PUSH BP
  MOVR BP, SP
  MOV R0, 10
  PUSH R0
  MOV R0, 5
  PUSH R0
  CALL add
  LDI R1, 8
  ADD SP, SP, R1
  SYSCALL 0
  MOVR SP, BP
  POP BP
  RET
`);
    expect(output.trim()).toBe('15');
  });

  it('branches with JZ/JMP (if/else lowering shape)', () => {
    // if (1 < 2) print(1) else print(0)
    const { output } = runAsm(`.global _start

_start:
  MOV R0, 1
  MOV R1, 2
  CLT R0, R0, R1
  JZ R0, else_branch
  MOV R0, 1
  SYSCALL 0
  JMP done
else_branch:
  MOV R0, 0
  SYSCALL 0
done:
  HALT
`);
    expect(output.trim()).toBe('1');
  });

  it('loops with JNZ (while lowering shape) — sums 1..3', () => {
    // i=3; acc=0; while(i!=0){ acc+=i; i-=1 } print(acc) => 6
    const { output } = runAsm(`.global _start

_start:
  MOV R2, 3
  MOV R3, 0
  MOV R4, 1
loop:
  JZ R2, end
  ADD R3, R3, R2
  SUB R2, R2, R4
  JMP loop
end:
  MOVR R0, R3
  SYSCALL 0
  HALT
`);
    expect(output.trim()).toBe('6');
  });
});
