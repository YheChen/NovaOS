import { diagnostic, type Diagnostic, type SourceSpan } from '@novaos/shared';
import type { BinaryOperator } from './ast';
import type { IRFunction, IRInstruction, IRModule, IRTerminator } from './ir';

export interface CodegenResult {
  readonly asm: string;
  /** Source span for each generated assembly line (1 entry per line, may be null). */
  readonly lineSpans: (SourceSpan | null)[];
  readonly diagnostics: Diagnostic[];
}

const BINARY_OPCODE: Record<BinaryOperator, string> = {
  '+': 'ADD',
  '-': 'SUB',
  '*': 'MUL',
  '/': 'DIV',
  '%': 'MOD',
  '==': 'CEQ',
  '!=': 'CNE',
  '<': 'CLT',
  '<=': 'CLE',
  '>': 'CGT',
  '>=': 'CGE',
  '&&': 'AND',
  '||': 'OR',
  '&': 'BAND',
  '|': 'BOR',
  '^': 'BXOR',
  '<<': 'SHL',
  '>>': 'SHR',
};

const MAX_SLOTS = 32; // displacement must fit a signed byte: -4*(31+1) = -128

/** Lower an optimized IR module to NovaASM with line→source-span tracking. */
export function generateAssembly(module: IRModule): CodegenResult {
  const lines: string[] = [];
  const lineSpans: (SourceSpan | null)[] = [];
  const diagnostics: Diagnostic[] = [];

  const emit = (text: string, span: SourceSpan | null = null): void => {
    lines.push(text);
    lineSpans.push(span);
  };

  emit('.global _start');
  emit('');
  emit('_start:');
  emit('  CALL main');
  emit('  HALT');
  emit('');

  for (const fn of module.functions) {
    lowerFunction(fn, emit, diagnostics);
    emit('');
  }

  return { asm: lines.join('\n'), lineSpans, diagnostics };
}

function lowerFunction(
  fn: IRFunction,
  emit: (text: string, span?: SourceSpan | null) => void,
  diagnostics: Diagnostic[],
): void {
  // Lay out locals accounting for array sizes; each local starts at a slot equal
  // to the sum of the sizes of the locals before it.
  const slotStart: number[] = [];
  let localSlots = 0;
  for (const l of fn.locals) {
    slotStart[l.id] = localSlots;
    localSlots += l.size;
  }
  const slotCount = localSlots + fn.tempCount;
  if (slotCount > MAX_SLOTS) {
    diagnostics.push(
      diagnostic({
        severity: 'error',
        code: 'codegen/frame-too-large',
        message: `Function \`${fn.name}\` needs ${slotCount} stack slots; the Version 1 frame supports at most ${MAX_SLOTS}.`,
        source: { line: fn.sourceSpan.start.line, column: fn.sourceSpan.start.column },
      }),
    );
    return;
  }

  const frameBytes = slotCount * 4;
  const off = (slot: number): number => -4 * (slot + 1);
  const localOff = (localId: number): number => off(slotStart[localId] ?? localId);
  const tempOff = (tempId: number): number => off(localSlots + tempId);

  emit(`${fn.name}:`, fn.sourceSpan);
  // Prologue.
  emit('  PUSH BP');
  emit('  MOVR BP, SP');
  if (frameBytes > 0) {
    emit(`  LDI R0, ${frameBytes}`);
    emit('  SUB SP, SP, R0');
  }
  // Copy parameters from the caller frame into their local slots.
  for (let i = 0; i < fn.paramCount; i += 1) {
    emit(`  LOAD R0, BP, ${8 + 4 * i}`);
    emit(`  STORE R0, BP, ${localOff(i)}`);
  }

  for (const block of fn.blocks) {
    emit(`${block.label}:`);
    for (const ins of block.instructions) lowerInstruction(ins, emit, tempOff, localOff);
    lowerTerminator(block.terminator, fn, emit, tempOff);
  }
}

function lowerInstruction(
  ins: IRInstruction,
  emit: (text: string, span?: SourceSpan | null) => void,
  tempOff: (t: number) => number,
  localOff: (l: number) => number,
): void {
  const s = ins.span;
  switch (ins.kind) {
    case 'const':
      if (ins.value <= 255) {
        emit(`  MOV R0, ${ins.value}`, s);
      } else if (ins.value <= 0xffff) {
        emit(`  LDI R0, ${ins.value}`, s);
      } else {
        // Compose a full 32-bit constant: R0 = (high << 16) + low.
        emit(`  LDI R1, ${ins.value & 0xffff}`, s);
        emit(`  LDIH R0, ${(ins.value >>> 16) & 0xffff}`, s);
        emit('  ADD R0, R0, R1', s);
      }
      emit(`  STORE R0, BP, ${tempOff(ins.target)}`, s);
      break;
    case 'load':
      emit(`  LOAD R0, BP, ${localOff(ins.local)}`, s);
      emit(`  STORE R0, BP, ${tempOff(ins.target)}`, s);
      break;
    case 'store':
      emit(`  LOAD R0, BP, ${tempOff(ins.value)}`, s);
      emit(`  STORE R0, BP, ${localOff(ins.local)}`, s);
      break;
    case 'binary':
      emit(`  LOAD R0, BP, ${tempOff(ins.left)}`, s);
      emit(`  LOAD R1, BP, ${tempOff(ins.right)}`, s);
      emit(`  ${BINARY_OPCODE[ins.op]} R0, R0, R1`, s);
      emit(`  STORE R0, BP, ${tempOff(ins.target)}`, s);
      break;
    case 'unary':
      emit(`  LOAD R0, BP, ${tempOff(ins.operand)}`, s);
      emit(ins.op === '-' ? '  NEG R0, R0' : '  NOT R0, R0', s);
      emit(`  STORE R0, BP, ${tempOff(ins.target)}`, s);
      break;
    case 'call': {
      // Dynamic-memory builtins compile to syscalls / direct memory access.
      if (ins.callee === 'malloc' || ins.callee === 'free') {
        emit(`  LOAD R0, BP, ${tempOff(ins.args[0] as number)}`, s);
        emit(ins.callee === 'malloc' ? '  SYSCALL 1' : '  SYSCALL 2', s);
        if (ins.target !== null) emit(`  STORE R0, BP, ${tempOff(ins.target)}`, s);
        break;
      }
      if (ins.callee === 'peek') {
        emit(`  LOAD R1, BP, ${tempOff(ins.args[0] as number)}`, s); // R1 = address
        emit('  LOAD R0, R1, 0', s); // R0 = mem[address]
        if (ins.target !== null) emit(`  STORE R0, BP, ${tempOff(ins.target)}`, s);
        break;
      }
      if (ins.callee === 'poke') {
        emit(`  LOAD R1, BP, ${tempOff(ins.args[0] as number)}`, s); // R1 = address
        emit(`  LOAD R0, BP, ${tempOff(ins.args[1] as number)}`, s); // R0 = value
        emit('  STORE R0, R1, 0', s); // mem[address] = value
        break;
      }
      // Scheduling builtins trap to the kernel: sleep(ticks) and yield().
      if (ins.callee === 'sleep') {
        emit(`  LOAD R0, BP, ${tempOff(ins.args[0] as number)}`, s); // R0 = ticks
        emit('  SYSCALL 5', s);
        break;
      }
      if (ins.callee === 'yield') {
        emit('  SYSCALL 6', s);
        break;
      }
      // Concurrency builtins: lock(id) / unlock(id) trap to the kernel mutex.
      if (ins.callee === 'lock' || ins.callee === 'unlock') {
        emit(`  LOAD R0, BP, ${tempOff(ins.args[0] as number)}`, s); // R0 = mutex id
        emit(ins.callee === 'lock' ? '  SYSCALL 7' : '  SYSCALL 8', s);
        break;
      }
      // shared(index) returns the address of a shared-memory word.
      if (ins.callee === 'shared') {
        emit(`  LOAD R0, BP, ${tempOff(ins.args[0] as number)}`, s); // R0 = index
        emit('  SYSCALL 9', s);
        if (ins.target !== null) emit(`  STORE R0, BP, ${tempOff(ins.target)}`, s);
        break;
      }
      // Push arguments right-to-left; argument i is read by the callee at [BP+8+4i].
      for (let i = ins.args.length - 1; i >= 0; i -= 1) {
        emit(`  LOAD R0, BP, ${tempOff(ins.args[i] as number)}`, s);
        emit('  PUSH R0', s);
      }
      emit(`  CALL ${ins.callee}`, s);
      if (ins.args.length > 0) {
        emit(`  LDI R1, ${ins.args.length * 4}`, s);
        emit('  ADD SP, SP, R1', s);
      }
      if (ins.target !== null) emit(`  STORE R0, BP, ${tempOff(ins.target)}`, s);
      break;
    }
    case 'loadElem':
      emit(`  LOAD R1, BP, ${tempOff(ins.index)}`, s); // R1 = index
      emit('  MOV R2, 2', s);
      emit('  SHL R1, R1, R2', s); // R1 = index * 4
      emit('  MOVR R0, BP', s);
      emit('  SUB R0, R0, R1', s); // R0 = BP - index*4
      emit(`  LOAD R0, R0, ${localOff(ins.local)}`, s); // R0 = array[index]
      emit(`  STORE R0, BP, ${tempOff(ins.target)}`, s);
      break;
    case 'storeElem':
      emit(`  LOAD R1, BP, ${tempOff(ins.index)}`, s);
      emit('  MOV R2, 2', s);
      emit('  SHL R1, R1, R2', s); // R1 = index * 4
      emit('  MOVR R0, BP', s);
      emit('  SUB R0, R0, R1', s); // R0 = BP - index*4
      emit(`  LOAD R2, BP, ${tempOff(ins.value)}`, s); // R2 = value
      emit(`  STORE R2, R0, ${localOff(ins.local)}`, s); // array[index] = value
      break;
    case 'print':
      emit(`  LOAD R0, BP, ${tempOff(ins.value)}`, s);
      emit('  SYSCALL 0', s);
      break;
  }
}

function lowerTerminator(
  term: IRTerminator,
  fn: IRFunction,
  emit: (text: string, span?: SourceSpan | null) => void,
  tempOff: (t: number) => number,
): void {
  const labelOf = (id: number): string =>
    fn.blocks.find((b) => b.id === id)?.label ?? `${fn.name}_bb${id}`;
  switch (term.kind) {
    case 'return':
      if (term.value !== null) emit(`  LOAD R0, BP, ${tempOff(term.value)}`, term.span);
      else emit('  MOV R0, 0', term.span);
      emit('  MOVR SP, BP', term.span);
      emit('  POP BP', term.span);
      emit('  RET', term.span);
      break;
    case 'jump':
      emit(`  JMP ${labelOf(term.target)}`, term.span);
      break;
    case 'branch':
      emit(`  LOAD R0, BP, ${tempOff(term.condition)}`, term.span);
      emit(`  JZ R0, ${labelOf(term.elseBlock)}`, term.span);
      emit(`  JMP ${labelOf(term.thenBlock)}`, term.span);
      break;
  }
}
