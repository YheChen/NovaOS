import type { BinaryOperator, UnaryOperator } from './ast';
import type { IRFunction, IRInstruction, IRModule, IRValueId } from './ir';

export interface OptimizationOptions {
  readonly constantFolding?: boolean;
  readonly copyPropagation?: boolean;
  readonly deadCodeElimination?: boolean;
}

export interface PassReport {
  readonly id: string;
  readonly name: string;
  /** A count of the transformations applied, for the UI optimization explorer. */
  readonly changes: number;
}

export interface OptimizeResult {
  readonly module: IRModule;
  readonly passes: PassReport[];
}

const DEFAULTS: Required<OptimizationOptions> = {
  constantFolding: true,
  copyPropagation: true,
  deadCodeElimination: true,
};

const mask32 = (n: number): number => n >>> 0;
const signed = (n: number): number => n | 0;

function foldBinary(op: BinaryOperator, a: number, b: number): number | null {
  switch (op) {
    case '+':
      return mask32(a + b);
    case '-':
      return mask32(a - b);
    case '*':
      return mask32(Math.imul(a, b));
    case '/':
      return b === 0 ? null : mask32(Math.trunc(signed(a) / signed(b)));
    case '%':
      return b === 0 ? null : mask32(signed(a) % signed(b));
    case '==':
      return a === b ? 1 : 0;
    case '!=':
      return a !== b ? 1 : 0;
    case '<':
      return signed(a) < signed(b) ? 1 : 0;
    case '<=':
      return signed(a) <= signed(b) ? 1 : 0;
    case '>':
      return signed(a) > signed(b) ? 1 : 0;
    case '>=':
      return signed(a) >= signed(b) ? 1 : 0;
    case '&&':
      return a !== 0 && b !== 0 ? 1 : 0;
    case '||':
      return a !== 0 || b !== 0 ? 1 : 0;
  }
}

function foldUnary(op: UnaryOperator, a: number): number {
  return op === '-' ? mask32(-signed(a)) : a === 0 ? 1 : 0;
}

function cloneFunction(fn: IRFunction): IRFunction {
  return {
    ...fn,
    blocks: fn.blocks.map((b) => ({ ...b, instructions: [...b.instructions] })),
  };
}

/** Constant folding: replace pure ops over constant temps with a single const. */
function constantFold(fn: IRFunction): number {
  let changes = 0;
  let changed = true;
  while (changed) {
    changed = false;
    const constants = new Map<IRValueId, number>();
    for (const block of fn.blocks) {
      for (const ins of block.instructions) {
        if (ins.kind === 'const') constants.set(ins.target, ins.value);
      }
    }
    for (const block of fn.blocks) {
      block.instructions = block.instructions.map((ins): IRInstruction => {
        if (ins.kind === 'binary') {
          const l = constants.get(ins.left);
          const r = constants.get(ins.right);
          if (l !== undefined && r !== undefined) {
            const folded = foldBinary(ins.op, l, r);
            if (folded !== null) {
              changes += 1;
              changed = true;
              return { kind: 'const', target: ins.target, value: folded, span: ins.span };
            }
          }
        } else if (ins.kind === 'unary') {
          const v = constants.get(ins.operand);
          if (v !== undefined) {
            changes += 1;
            changed = true;
            return {
              kind: 'const',
              target: ins.target,
              value: foldUnary(ins.op, v),
              span: ins.span,
            };
          }
        }
        return ins;
      });
    }
  }
  return changes;
}

/** Copy propagation via store→load forwarding within a basic block. */
function copyPropagate(fn: IRFunction): number {
  const subst = new Map<IRValueId, IRValueId>();
  for (const block of fn.blocks) {
    const localValue = new Map<number, IRValueId>(); // local slot -> temp holding its value
    for (const ins of block.instructions) {
      if (ins.kind === 'store') {
        localValue.set(ins.local, resolve(subst, ins.value));
      } else if (ins.kind === 'load') {
        const cached = localValue.get(ins.local);
        if (cached !== undefined) subst.set(ins.target, cached);
        else localValue.set(ins.local, ins.target);
      }
    }
  }
  if (subst.size === 0) return 0;
  applySubstitution(fn, subst);
  return subst.size;
}

function resolve(subst: Map<IRValueId, IRValueId>, v: IRValueId): IRValueId {
  let cur = v;
  while (subst.has(cur)) cur = subst.get(cur) as IRValueId;
  return cur;
}

function applySubstitution(fn: IRFunction, subst: Map<IRValueId, IRValueId>): void {
  const r = (v: IRValueId): IRValueId => resolve(subst, v);
  for (const block of fn.blocks) {
    block.instructions = block.instructions.map((ins): IRInstruction => {
      switch (ins.kind) {
        case 'store':
          return { ...ins, value: r(ins.value) };
        case 'binary':
          return { ...ins, left: r(ins.left), right: r(ins.right) };
        case 'unary':
          return { ...ins, operand: r(ins.operand) };
        case 'call':
          return { ...ins, args: ins.args.map(r) };
        case 'print':
          return { ...ins, value: r(ins.value) };
        default:
          return ins;
      }
    });
    if (block.terminator.kind === 'return' && block.terminator.value !== null) {
      block.terminator = { ...block.terminator, value: r(block.terminator.value) };
    } else if (block.terminator.kind === 'branch') {
      block.terminator = { ...block.terminator, condition: r(block.terminator.condition) };
    }
  }
}

/** Dead code elimination: drop pure instructions whose result is never used. */
function deadCodeEliminate(fn: IRFunction): number {
  let changes = 0;
  let changed = true;
  while (changed) {
    changed = false;
    const used = collectUsed(fn);
    for (const block of fn.blocks) {
      const next = block.instructions.filter((ins) => {
        const pure =
          ins.kind === 'const' ||
          ins.kind === 'load' ||
          ins.kind === 'binary' ||
          ins.kind === 'unary';
        if (pure && !used.has(ins.target)) {
          changes += 1;
          changed = true;
          return false;
        }
        return true;
      });
      block.instructions = next;
    }
  }
  return changes;
}

function collectUsed(fn: IRFunction): Set<IRValueId> {
  const used = new Set<IRValueId>();
  const use = (v: IRValueId): void => void used.add(v);
  for (const block of fn.blocks) {
    for (const ins of block.instructions) {
      switch (ins.kind) {
        case 'store':
          use(ins.value);
          break;
        case 'binary':
          use(ins.left);
          use(ins.right);
          break;
        case 'unary':
          use(ins.operand);
          break;
        case 'call':
          ins.args.forEach(use);
          break;
        case 'print':
          use(ins.value);
          break;
      }
    }
    if (block.terminator.kind === 'return' && block.terminator.value !== null)
      use(block.terminator.value);
    else if (block.terminator.kind === 'branch') use(block.terminator.condition);
  }
  return used;
}

/** Run the (optional, toggleable) optimization pipeline over a module. */
export function optimize(module: IRModule, options: OptimizationOptions = {}): OptimizeResult {
  const opts = { ...DEFAULTS, ...options };
  const functions = module.functions.map(cloneFunction);
  const out: IRModule = { functions, diagnostics: module.diagnostics };

  let foldChanges = 0;
  let copyChanges = 0;
  let dceChanges = 0;
  for (const fn of functions) {
    if (opts.constantFolding) foldChanges += constantFold(fn);
    if (opts.copyPropagation) copyChanges += copyPropagate(fn);
    if (opts.deadCodeElimination) dceChanges += deadCodeEliminate(fn);
  }

  const passes: PassReport[] = [];
  if (opts.constantFolding)
    passes.push({ id: 'const-fold', name: 'Constant Folding', changes: foldChanges });
  if (opts.copyPropagation)
    passes.push({ id: 'copy-prop', name: 'Copy Propagation', changes: copyChanges });
  if (opts.deadCodeElimination)
    passes.push({ id: 'dce', name: 'Dead Code Elimination', changes: dceChanges });

  return { module: out, passes };
}
