/**
 * A deterministic Toy C program generator for differential testing.
 *
 * Every program it emits is well-defined by construction: loops always
 * terminate, divisors are never zero, array indices are always in bounds, and
 * no statement contains two side-effecting subexpressions. That matters more
 * than it sounds. Without those guarantees a mismatch between the reference
 * interpreter and the compiled bytecode would be ambiguous, and the fuzzer
 * would spend its time rediscovering that undefined behaviour is undefined.
 * With them, every difference is a real defect in the toolchain.
 */
import type { DeterministicRandom } from '@novaos/shared';

export interface GeneratorLimits {
  /** Helper functions emitted before `main`. */
  readonly helperFunctions: number;
  /** Statements a single function may emit, across all of its blocks. */
  readonly statementBudget: number;
  /** Maximum expression nesting depth. */
  readonly expressionDepth: number;
  /** Maximum nested loop depth. */
  readonly loopDepth: number;
}

/**
 * Sized against the 32-slot frame. Because code generation reuses the slot of
 * a temporary whose live range has ended, frame size tracks how many values a
 * function needs at once rather than how many expressions it contains, and
 * these limits compile every seed. Before slots were reused the same settings
 * produced a worst-case frame of 236 slots and compiled nothing at all.
 */
export const DEFAULT_LIMITS: GeneratorLimits = {
  helperFunctions: 3,
  statementBudget: 12,
  expressionDepth: 3,
  loopDepth: 3,
};

/** Operators that take ints and produce an int. */
const INT_BINARY_OPS = ['+', '-', '*', '&', '|', '^', '<<', '>>'] as const;
/** Operators that take ints and produce a bool. */
const COMPARISON_OPS = ['==', '!=', '<', '<=', '>', '>='] as const;

const ARRAY_SIZE = 4;
const ARRAY_INDEX_MASK = ARRAY_SIZE - 1;

interface FunctionSignature {
  readonly name: string;
  readonly arity: number;
}

interface Context {
  readonly rng: DeterministicRandom;
  readonly limits: GeneratorLimits;
  /** Functions already defined, and therefore safe to call without recursing. */
  readonly callable: FunctionSignature[];
  /** Int-typed names currently in scope. */
  vars: string[];
  /** Loop control variables; assigning to one could stop a loop terminating. */
  frozen: Set<string>;
  arrays: string[];
  nextName: number;
  budget: number;
  loopDepth: number;
  /** `continue` skips a `while` loop's decrement, so it is only safe in `for`. */
  inForLoop: boolean;
  /** At most one call per expression keeps side-effect order unambiguous. */
  callUsed: boolean;
}

const chance = (c: Context, percent: number): boolean => c.rng.nextInt(0, 100) < percent;

function fresh(c: Context, prefix: string): string {
  const name = `${prefix}${c.nextName}`;
  c.nextName += 1;
  return name;
}

function atom(c: Context): string {
  if (c.vars.length > 0 && chance(c, 60)) return c.rng.pick(c.vars);
  return String(c.rng.nextInt(0, 24));
}

/** An int-typed expression. */
function expression(c: Context, depth: number): string {
  if (depth <= 0 || chance(c, 25)) return atom(c);

  const roll = c.rng.nextInt(0, 100);

  if (roll < 12 && c.callable.length > 0 && !c.callUsed) {
    c.callUsed = true;
    const fn = c.rng.pick(c.callable);
    const args = Array.from({ length: fn.arity }, () => expression(c, depth - 1));
    return `${fn.name}(${args.join(', ')})`;
  }

  if (roll < 24 && c.arrays.length > 0) {
    const array = c.rng.pick(c.arrays);
    return `${array}[(${expression(c, depth - 1)}) & ${ARRAY_INDEX_MASK}]`;
  }

  if (roll < 32) return `(-(${expression(c, depth - 1)}))`;

  // `| 1` always sets the low bit, so the divisor can never be zero.
  if (roll < 42) return `((${expression(c, depth - 1)}) / ((${expression(c, depth - 1)}) | 1))`;
  if (roll < 52) return `((${expression(c, depth - 1)}) % ((${expression(c, depth - 1)}) | 1))`;

  const op = c.rng.pick(INT_BINARY_OPS);
  return `((${expression(c, depth - 1)}) ${op} (${expression(c, depth - 1)}))`;
}

/** A bool-typed expression, for use as a condition. */
function condition(c: Context, depth: number): string {
  const comparison = (): string => {
    const op = c.rng.pick(COMPARISON_OPS);
    return `((${expression(c, depth)}) ${op} (${expression(c, depth)}))`;
  };
  if (chance(c, 25)) {
    const op = c.rng.pick(['&&', '||'] as const);
    return `(${comparison()} ${op} ${comparison()})`;
  }
  return comparison();
}

/**
 * Generate a statement-level expression. The call budget is reset once per
 * statement, not per expression, so a statement such as `a[f()] = g()` is
 * never produced: C leaves the order of those two calls unspecified, and a
 * generated program must not depend on it.
 */
function rootExpression(c: Context, depth = c.limits.expressionDepth): string {
  return expression(c, depth);
}

function rootCondition(c: Context): string {
  return condition(c, Math.max(1, c.limits.expressionDepth - 1));
}

const pad = (indent: number): string => '  '.repeat(indent);

/** Generate a brace-delimited block, restoring the enclosing scope afterwards. */
function block(c: Context, indent: number): string[] {
  const outerVars = [...c.vars];
  const outerArrays = [...c.arrays];
  const lines: string[] = [];
  const count = c.rng.nextInt(1, 3);
  for (let i = 0; i < count && c.budget > 0; i += 1) {
    lines.push(...statement(c, indent));
  }
  if (lines.length === 0) lines.push(`${pad(indent)}print(0);`);
  c.vars = outerVars;
  c.arrays = outerArrays;
  return lines;
}

function statement(c: Context, indent: number): string[] {
  c.budget -= 1;
  c.callUsed = false;
  const roll = c.rng.nextInt(0, 100);
  const assignable = c.vars.filter((v) => !c.frozen.has(v));

  // Declare a local.
  if (roll < 20) {
    const name = fresh(c, 'v');
    const line = `${pad(indent)}int ${name} = ${rootExpression(c)};`;
    c.vars.push(name);
    return [line];
  }

  // Declare an array, initialising every element. A frame is not zeroed, so
  // reading an uninitialised element would make the program's output depend on
  // whatever the previous frame left on the stack.
  if (roll < 28 && c.arrays.length === 0) {
    const name = fresh(c, 'a');
    const lines = [`${pad(indent)}int ${name}[${ARRAY_SIZE}];`];
    c.arrays.push(name);
    for (let index = 0; index < ARRAY_SIZE; index += 1) {
      lines.push(`${pad(indent)}${name}[${index}] = ${atom(c)};`);
    }
    return lines;
  }

  // Assign to an existing local.
  if (roll < 42 && assignable.length > 0) {
    const target = c.rng.pick(assignable);
    return [`${pad(indent)}${target} = ${rootExpression(c)};`];
  }

  // Write through an array subscript.
  if (roll < 50 && c.arrays.length > 0) {
    const array = c.rng.pick(c.arrays);
    return [
      `${pad(indent)}${array}[(${rootExpression(c)}) & ${ARRAY_INDEX_MASK}] = ${rootExpression(c)};`,
    ];
  }

  // break / continue, only where they are safe.
  if (roll < 56 && c.loopDepth > 0) {
    if (c.inForLoop && chance(c, 50)) return [`${pad(indent)}continue;`];
    return [`${pad(indent)}break;`];
  }

  if (roll < 70) {
    const lines = [`${pad(indent)}if (${rootCondition(c)}) {`];
    lines.push(...block(c, indent + 1));
    if (chance(c, 50)) {
      lines.push(`${pad(indent)}} else {`);
      lines.push(...block(c, indent + 1));
    }
    lines.push(`${pad(indent)}}`);
    return lines;
  }

  if (roll < 84 && c.loopDepth < c.limits.loopDepth) {
    // A counted `for`; `continue` lands on the update, so it stays safe.
    const i = fresh(c, 'i');
    const bound = c.rng.nextInt(1, 4);
    const lines = [`${pad(indent)}for (int ${i} = 0; ${i} < ${bound}; ${i} = ${i} + 1) {`];
    const outerVars = [...c.vars];
    c.vars.push(i);
    c.frozen.add(i);
    c.loopDepth += 1;
    const wasInFor = c.inForLoop;
    c.inForLoop = true;
    lines.push(...block(c, indent + 1));
    c.inForLoop = wasInFor;
    c.loopDepth -= 1;
    c.frozen.delete(i);
    c.vars = outerVars;
    lines.push(`${pad(indent)}}`);
    return lines;
  }

  if (c.loopDepth < c.limits.loopDepth) {
    // A counted `while` / `do-while`. The counter is frozen so the body cannot
    // interfere with it, and `continue` is suppressed inside, so the decrement
    // always runs.
    const counter = fresh(c, 'n');
    const bound = c.rng.nextInt(1, 4);
    const isDoWhile = chance(c, 35);
    const lines = [`${pad(indent)}int ${counter} = ${bound};`];
    const outerVars = [...c.vars];
    c.vars.push(counter);
    c.frozen.add(counter);
    c.loopDepth += 1;
    const wasInFor = c.inForLoop;
    c.inForLoop = false;

    lines.push(isDoWhile ? `${pad(indent)}do {` : `${pad(indent)}while (${counter} > 0) {`);
    const body = block(c, indent + 1);
    body.push(`${pad(indent + 1)}${counter} = ${counter} - 1;`);
    lines.push(...body);
    lines.push(isDoWhile ? `${pad(indent)}} while (${counter} > 0);` : `${pad(indent)}}`);

    c.inForLoop = wasInFor;
    c.loopDepth -= 1;
    c.frozen.delete(counter);
    c.vars = outerVars;
    return lines;
  }

  return [`${pad(indent)}print(${rootExpression(c)});`];
}

function emitFunction(
  rng: DeterministicRandom,
  limits: GeneratorLimits,
  callable: FunctionSignature[],
  name: string,
  arity: number,
): string {
  const params = Array.from({ length: arity }, (_, i) => `p${i}`);
  const c: Context = {
    rng,
    limits,
    callable,
    vars: [...params],
    frozen: new Set(),
    arrays: [],
    nextName: 0,
    budget: limits.statementBudget,
    loopDepth: 0,
    inForLoop: false,
    callUsed: false,
  };

  const body: string[] = [];
  while (c.budget > 0) body.push(...statement(c, 1));
  // A print in every function makes differences observable rather than silent.
  c.callUsed = false;
  body.push(`${pad(1)}print(${rootExpression(c)});`);
  c.callUsed = false;
  body.push(`${pad(1)}return ${rootExpression(c)};`);

  const signature = params.map((p) => `int ${p}`).join(', ');
  return [`int ${name}(${signature}) {`, ...body, '}'].join('\n');
}

/**
 * Generate one complete, self-contained Toy C program. The same seed always
 * produces the same source.
 */
export function generateProgram(
  rng: DeterministicRandom,
  limits: GeneratorLimits = DEFAULT_LIMITS,
): string {
  const callable: FunctionSignature[] = [];
  const parts: string[] = [];

  for (let i = 0; i < limits.helperFunctions; i += 1) {
    const name = `f${i}`;
    const arity = rng.nextInt(0, 3);
    parts.push(emitFunction(rng, limits, [...callable], name, arity));
    callable.push({ name, arity });
  }

  parts.push(emitFunction(rng, limits, [...callable], 'main', 0));
  return `${parts.join('\n\n')}\n`;
}
