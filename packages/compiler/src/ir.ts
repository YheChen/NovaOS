import type { Diagnostic, SourceSpan } from '@novaos/shared';
import type { BinaryOperator, UnaryOperator } from './ast';
import type { ToyType } from './types';

/** A virtual register (SSA-free temporary), unique within a function. */
export type IRValueId = number;
export type BasicBlockId = number;

export interface IRLocal {
  readonly id: number;
  readonly name: string;
  readonly type: ToyType;
  readonly isParam: boolean;
  /** Number of words this local occupies (1 for scalars, N for arrays). */
  readonly size: number;
}

export type IRInstruction =
  | {
      readonly kind: 'const';
      readonly target: IRValueId;
      readonly value: number;
      readonly span: SourceSpan;
    }
  | {
      readonly kind: 'load';
      readonly target: IRValueId;
      readonly local: number;
      readonly span: SourceSpan;
    }
  | {
      readonly kind: 'store';
      readonly local: number;
      readonly value: IRValueId;
      readonly span: SourceSpan;
    }
  | {
      readonly kind: 'binary';
      readonly op: BinaryOperator;
      readonly target: IRValueId;
      readonly left: IRValueId;
      readonly right: IRValueId;
      readonly span: SourceSpan;
    }
  | {
      readonly kind: 'unary';
      readonly op: UnaryOperator;
      readonly target: IRValueId;
      readonly operand: IRValueId;
      readonly span: SourceSpan;
    }
  | {
      readonly kind: 'call';
      readonly target: IRValueId | null;
      readonly callee: string;
      readonly args: readonly IRValueId[];
      readonly span: SourceSpan;
    }
  | {
      readonly kind: 'loadElem';
      readonly target: IRValueId;
      readonly local: number;
      readonly index: IRValueId;
      readonly span: SourceSpan;
    }
  | {
      readonly kind: 'storeElem';
      readonly local: number;
      readonly index: IRValueId;
      readonly value: IRValueId;
      readonly span: SourceSpan;
    }
  | { readonly kind: 'print'; readonly value: IRValueId; readonly span: SourceSpan };

export type IRTerminator =
  | { readonly kind: 'return'; readonly value: IRValueId | null; readonly span: SourceSpan }
  | { readonly kind: 'jump'; readonly target: BasicBlockId; readonly span: SourceSpan }
  | {
      readonly kind: 'branch';
      readonly condition: IRValueId;
      readonly thenBlock: BasicBlockId;
      readonly elseBlock: BasicBlockId;
      readonly span: SourceSpan;
    };

export interface IRBasicBlock {
  readonly id: BasicBlockId;
  readonly label: string;
  instructions: IRInstruction[];
  terminator: IRTerminator;
}

export interface IRFunction {
  readonly name: string;
  readonly returnType: ToyType;
  readonly locals: IRLocal[];
  readonly paramCount: number;
  /** Number of temporaries allocated (slots `locals.length .. +tempCount`). */
  readonly tempCount: number;
  readonly blocks: IRBasicBlock[];
  readonly sourceSpan: SourceSpan;
}

export interface IRModule {
  readonly functions: IRFunction[];
  readonly diagnostics: Diagnostic[];
}

/** A stable textual rendering of an IR module (for the inspector + golden tests). */
export function formatIR(module: IRModule): string {
  const lines: string[] = [];
  for (const fn of module.functions) {
    const params = fn.locals
      .filter((l) => l.isParam)
      .map((l) => `${l.type.kind} ${l.name}`)
      .join(', ');
    lines.push(`func ${fn.name}(${params}) -> ${fn.returnType.kind} {`);
    for (const block of fn.blocks) {
      lines.push(`  ${block.label}:`);
      for (const ins of block.instructions) lines.push(`    ${formatInstruction(ins)}`);
      lines.push(`    ${formatTerminator(block.terminator)}`);
    }
    lines.push('}');
  }
  return lines.join('\n');
}

function formatInstruction(ins: IRInstruction): string {
  switch (ins.kind) {
    case 'const':
      return `t${ins.target} = const ${ins.value}`;
    case 'load':
      return `t${ins.target} = load @${ins.local}`;
    case 'store':
      return `store @${ins.local} = t${ins.value}`;
    case 'binary':
      return `t${ins.target} = t${ins.left} ${ins.op} t${ins.right}`;
    case 'unary':
      return `t${ins.target} = ${ins.op}t${ins.operand}`;
    case 'call':
      return `${ins.target === null ? '' : `t${ins.target} = `}call ${ins.callee}(${ins.args.map((a) => `t${a}`).join(', ')})`;
    case 'loadElem':
      return `t${ins.target} = load @${ins.local}[t${ins.index}]`;
    case 'storeElem':
      return `store @${ins.local}[t${ins.index}] = t${ins.value}`;
    case 'print':
      return `print t${ins.value}`;
  }
}

function formatTerminator(term: IRTerminator): string {
  switch (term.kind) {
    case 'return':
      return term.value === null ? 'return' : `return t${term.value}`;
    case 'jump':
      return `jump bb${term.target}`;
    case 'branch':
      return `branch t${term.condition} ? bb${term.thenBlock} : bb${term.elseBlock}`;
  }
}
