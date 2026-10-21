/**
 * A reference interpreter for Toy C, walking the AST directly.
 *
 * This is the oracle the compiled pipeline is checked against: it shares no
 * code with IR generation, the optimizer, the code generator, the assembler or
 * the VM, so when the two disagree the difference points at a real defect in
 * one of them rather than at a bug they both inherited.
 *
 * Its arithmetic deliberately mirrors the CPU rather than C. Values are stored
 * as unsigned 32-bit words, `>>` is logical, `/` and `%` are signed, and
 * `print` emits the raw word, so `-1` prints as 4294967295. `&&` and `||`
 * short-circuit, matching the branches the IR generator emits for them.
 */
import type {
  ExpressionNode,
  FunctionDeclarationNode,
  ProgramNode,
  StatementNode,
  BinaryOperator,
} from '@novaos/compiler';

export interface InterpretResult {
  readonly output: string;
  readonly steps: number;
}

const m32 = (n: number): number => n >>> 0;
const s32 = (n: number): number => n | 0;

/** Raised when a program does something the VM would trap on. */
export class InterpreterTrap extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'InterpreterTrap';
  }
}

function applyBinary(op: BinaryOperator, a: number, b: number): number {
  switch (op) {
    case '+':
      return m32(a + b);
    case '-':
      return m32(a - b);
    case '*':
      return m32(Math.imul(a, b));
    case '/':
      if (b === 0) throw new InterpreterTrap('cpu/divide-by-zero', 'Division by zero.');
      return m32(Math.trunc(s32(a) / s32(b)));
    case '%':
      if (b === 0) throw new InterpreterTrap('cpu/divide-by-zero', 'Modulo by zero.');
      return m32(s32(a) % s32(b));
    case '==':
      return a === b ? 1 : 0;
    case '!=':
      return a !== b ? 1 : 0;
    case '<':
      return s32(a) < s32(b) ? 1 : 0;
    case '<=':
      return s32(a) <= s32(b) ? 1 : 0;
    case '>':
      return s32(a) > s32(b) ? 1 : 0;
    case '>=':
      return s32(a) >= s32(b) ? 1 : 0;
    case '&&':
      return a !== 0 && b !== 0 ? 1 : 0;
    case '||':
      return a !== 0 || b !== 0 ? 1 : 0;
    case '&':
      return m32(a & b);
    case '|':
      return m32(a | b);
    case '^':
      return m32(a ^ b);
    case '<<':
      return m32(a << (b & 31));
    case '>>':
      return m32(a >>> (b & 31));
  }
}

type Flow =
  | { readonly kind: 'normal' }
  | { readonly kind: 'break' }
  | { readonly kind: 'continue' }
  | { readonly kind: 'return'; readonly value: number };

const NORMAL: Flow = { kind: 'normal' };

interface Frame {
  readonly scopes: Array<Map<string, number>>;
  readonly arrays: Map<string, number[]>;
}

/**
 * Run `program` and return everything it printed. `stepBudget` bounds the run
 * so a generated program that fails to terminate surfaces as an error instead
 * of hanging the suite.
 */
export function interpret(program: ProgramNode, stepBudget = 2_000_000): InterpretResult {
  const functions = new Map<string, FunctionDeclarationNode>();
  for (const declaration of program.declarations) {
    if (declaration.kind === 'FunctionDeclaration') {
      functions.set(declaration.name.name, declaration);
    }
  }

  const output: string[] = [];
  let steps = 0;

  const step = (): void => {
    steps += 1;
    if (steps > stepBudget) {
      throw new InterpreterTrap('interpreter/step-budget', `Exceeded ${stepBudget} steps.`);
    }
  };

  const read = (frame: Frame, name: string): number => {
    for (let i = frame.scopes.length - 1; i >= 0; i -= 1) {
      const scope = frame.scopes[i];
      const value = scope?.get(name);
      if (value !== undefined) return value;
    }
    throw new InterpreterTrap('interpreter/unbound', `Unbound variable \`${name}\`.`);
  };

  const write = (frame: Frame, name: string, value: number): void => {
    for (let i = frame.scopes.length - 1; i >= 0; i -= 1) {
      const scope = frame.scopes[i];
      if (scope?.has(name)) {
        scope.set(name, value);
        return;
      }
    }
    throw new InterpreterTrap('interpreter/unbound', `Assignment to unbound \`${name}\`.`);
  };

  const declare = (frame: Frame, name: string, value: number): void => {
    const scope = frame.scopes[frame.scopes.length - 1];
    if (!scope) throw new InterpreterTrap('interpreter/no-scope', 'No active scope.');
    scope.set(name, value);
  };

  function evaluate(node: ExpressionNode, frame: Frame): number {
    step();
    switch (node.kind) {
      case 'IntegerLiteral':
        return m32(node.value);
      case 'BooleanLiteral':
        return node.value ? 1 : 0;
      case 'Identifier':
        return read(frame, node.name);
      case 'UnaryExpression': {
        const value = evaluate(node.operand, frame);
        return node.operator === '-' ? m32(-s32(value)) : value === 0 ? 1 : 0;
      }
      case 'BinaryExpression': {
        // `&&` and `||` are lowered to control flow, so they short-circuit and
        // yield the right-hand operand's raw value rather than a normalized 1:
        // `a && b` is `a ? b : 0` and `a || b` is `a ? 1 : b`.
        if (node.operator === '&&') {
          return evaluate(node.left, frame) === 0 ? 0 : evaluate(node.right, frame);
        }
        if (node.operator === '||') {
          return evaluate(node.left, frame) !== 0 ? 1 : evaluate(node.right, frame);
        }
        return applyBinary(node.operator, evaluate(node.left, frame), evaluate(node.right, frame));
      }
      case 'IndexExpression': {
        const array = frame.arrays.get(node.array.name);
        if (!array) {
          throw new InterpreterTrap('interpreter/unbound', `Unknown array \`${node.array.name}\`.`);
        }
        const index = evaluate(node.index, frame);
        const element = array[index];
        if (element === undefined) {
          throw new InterpreterTrap(
            'interpreter/out-of-bounds',
            `Index ${index} is outside \`${node.array.name}\`.`,
          );
        }
        return element;
      }
      case 'AssignmentExpression': {
        if (node.target.kind === 'Identifier') {
          const assigned = evaluate(node.value, frame);
          write(frame, node.target.name, assigned);
          return assigned;
        }
        const array = frame.arrays.get(node.target.array.name);
        if (!array) {
          throw new InterpreterTrap(
            'interpreter/unbound',
            `Unknown array \`${node.target.array.name}\`.`,
          );
        }
        // The IR generator lowers the subscript before the right-hand side.
        const index = evaluate(node.target.index, frame);
        const value = evaluate(node.value, frame);
        if (index >= array.length) {
          throw new InterpreterTrap(
            'interpreter/out-of-bounds',
            `Index ${index} is outside \`${node.target.array.name}\`.`,
          );
        }
        array[index] = value;
        return value;
      }
      case 'CallExpression': {
        const name = node.callee.name;
        const args = node.args.map((arg) => evaluate(arg, frame));
        if (name === 'print') {
          output.push(`${args[0] ?? 0}\n`);
          return 0;
        }
        const target = functions.get(name);
        if (!target) {
          throw new InterpreterTrap('interpreter/unknown-call', `Unknown function \`${name}\`.`);
        }
        return call(target, args);
      }
    }
  }

  function execute(node: StatementNode, frame: Frame): Flow {
    step();
    switch (node.kind) {
      case 'VariableDeclaration': {
        if (node.arraySize !== undefined) {
          frame.arrays.set(node.name.name, new Array<number>(node.arraySize).fill(0));
          return NORMAL;
        }
        declare(frame, node.name.name, node.initializer ? evaluate(node.initializer, frame) : 0);
        return NORMAL;
      }
      case 'ExpressionStatement':
        evaluate(node.expression, frame);
        return NORMAL;
      case 'BlockStatement': {
        frame.scopes.push(new Map());
        try {
          for (const statement of node.statements) {
            const flow = execute(statement, frame);
            if (flow.kind !== 'normal') return flow;
          }
          return NORMAL;
        } finally {
          frame.scopes.pop();
        }
      }
      case 'IfStatement': {
        if (evaluate(node.condition, frame) !== 0) return execute(node.thenBranch, frame);
        return node.elseBranch ? execute(node.elseBranch, frame) : NORMAL;
      }
      case 'WhileStatement': {
        while (evaluate(node.condition, frame) !== 0) {
          const flow = execute(node.body, frame);
          if (flow.kind === 'break') break;
          if (flow.kind === 'return') return flow;
        }
        return NORMAL;
      }
      case 'DoWhileStatement': {
        do {
          const flow = execute(node.body, frame);
          if (flow.kind === 'break') break;
          if (flow.kind === 'return') return flow;
        } while (evaluate(node.condition, frame) !== 0);
        return NORMAL;
      }
      case 'ForStatement': {
        frame.scopes.push(new Map());
        try {
          if (node.init) execute(node.init, frame);
          while (node.condition === null || evaluate(node.condition, frame) !== 0) {
            const flow = execute(node.body, frame);
            if (flow.kind === 'break') break;
            if (flow.kind === 'return') return flow;
            if (node.update) evaluate(node.update, frame);
          }
          return NORMAL;
        } finally {
          frame.scopes.pop();
        }
      }
      case 'BreakStatement':
        return { kind: 'break' };
      case 'ContinueStatement':
        return { kind: 'continue' };
      case 'ReturnStatement':
        return { kind: 'return', value: node.value ? evaluate(node.value, frame) : 0 };
    }
  }

  function call(target: FunctionDeclarationNode, args: number[]): number {
    const scope = new Map<string, number>();
    target.parameters.forEach((parameter, index) => {
      scope.set(parameter.name.name, m32(args[index] ?? 0));
    });
    const frame: Frame = { scopes: [scope], arrays: new Map() };
    const flow = execute(target.body, frame);
    return flow.kind === 'return' ? flow.value : 0;
  }

  const main = functions.get('main');
  if (!main) throw new InterpreterTrap('interpreter/no-main', 'Program has no `main`.');
  call(main, []);

  return { output: output.join(''), steps };
}
