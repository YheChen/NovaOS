import { diagnostic, type Diagnostic, type SourceSpan } from '@novaos/shared';
import type {
  AstNodeId,
  ExpressionNode,
  FunctionDeclarationNode,
  ProgramNode,
  StatementNode,
} from './ast';
import { BOOL, ERROR, INT, VOID, typeName, typesEqual, typeFromName, type ToyType } from './types';

export type SymbolKind = 'global' | 'local' | 'param' | 'function';

export interface VariableSymbol {
  readonly name: string;
  readonly type: ToyType;
  readonly kind: 'global' | 'local' | 'param';
  /** Element count when this variable is a fixed-size array. */
  readonly arraySize?: number;
}

export interface FunctionSymbol {
  readonly name: string;
  readonly returnType: ToyType;
  readonly parameters: readonly { readonly name: string; readonly type: ToyType }[];
}

export interface SymbolTableSnapshot {
  readonly globals: readonly VariableSymbol[];
  readonly functions: readonly FunctionSymbol[];
}

export interface SemanticResult {
  readonly diagnostics: Diagnostic[];
  /** Resolved type per expression AST node (for the inspector and IR gen). */
  readonly types: Map<AstNodeId, ToyType>;
  readonly symbols: SymbolTableSnapshot;
  readonly functions: ReadonlyMap<string, FunctionSymbol>;
}

interface Scope {
  readonly vars: Map<string, VariableSymbol>;
  readonly parent: Scope | null;
}

const BUILTINS: Record<string, FunctionSymbol> = {
  print: { name: 'print', returnType: VOID, parameters: [{ name: 'value', type: INT }] },
  malloc: { name: 'malloc', returnType: INT, parameters: [{ name: 'size', type: INT }] },
  free: { name: 'free', returnType: VOID, parameters: [{ name: 'ptr', type: INT }] },
  peek: { name: 'peek', returnType: INT, parameters: [{ name: 'addr', type: INT }] },
  poke: {
    name: 'poke',
    returnType: VOID,
    parameters: [
      { name: 'addr', type: INT },
      { name: 'value', type: INT },
    ],
  },
  sleep: { name: 'sleep', returnType: VOID, parameters: [{ name: 'ticks', type: INT }] },
  yield: { name: 'yield', returnType: VOID, parameters: [] },
  lock: { name: 'lock', returnType: VOID, parameters: [{ name: 'id', type: INT }] },
  unlock: { name: 'unlock', returnType: VOID, parameters: [{ name: 'id', type: INT }] },
  shared: { name: 'shared', returnType: INT, parameters: [{ name: 'index', type: INT }] },
  send: {
    name: 'send',
    returnType: VOID,
    parameters: [
      { name: 'pipe', type: INT },
      { name: 'value', type: INT },
    ],
  },
  receive: { name: 'receive', returnType: INT, parameters: [{ name: 'pipe', type: INT }] },
};

export function analyze(program: ProgramNode): SemanticResult {
  const diagnostics: Diagnostic[] = [];
  const types = new Map<AstNodeId, ToyType>();
  const functions = new Map<string, FunctionSymbol>();
  const globals = new Map<string, VariableSymbol>();

  const err = (
    message: string,
    span: SourceSpan,
    code = 'sema/type-error',
    hint?: string,
  ): void => {
    diagnostics.push(
      diagnostic({
        severity: 'error',
        code,
        message,
        source: { line: span.start.line, column: span.start.column },
        ...(hint ? { hint } : {}),
      }),
    );
  };

  // Pass 1: collect function signatures and global variables (forward references).
  for (const decl of program.declarations) {
    if (decl.kind === 'FunctionDeclaration') {
      if (functions.has(decl.name.name)) {
        err(`Duplicate function \`${decl.name.name}\`.`, decl.name.span, 'sema/duplicate');
        continue;
      }
      functions.set(decl.name.name, {
        name: decl.name.name,
        returnType: typeFromName(decl.returnType.name),
        parameters: decl.parameters.map((p) => ({
          name: p.name.name,
          type: typeFromName(p.type.name),
        })),
      });
    } else {
      if (decl.type.name === 'void') err('A variable cannot have type void.', decl.type.span);
      if (globals.has(decl.name.name)) {
        err(`Duplicate global \`${decl.name.name}\`.`, decl.name.span, 'sema/duplicate');
        continue;
      }
      globals.set(decl.name.name, {
        name: decl.name.name,
        type: typeFromName(decl.type.name),
        kind: 'global',
      });
    }
  }

  const lookup = (scope: Scope | null, name: string): VariableSymbol | undefined => {
    for (let s = scope; s; s = s.parent) {
      const found = s.vars.get(name);
      if (found) return found;
    }
    return globals.get(name);
  };

  // --- Expression typing ---------------------------------------------------
  const typeOf = (expr: ExpressionNode, scope: Scope): ToyType => {
    let result: ToyType;
    switch (expr.kind) {
      case 'IntegerLiteral':
        result = INT;
        break;
      case 'BooleanLiteral':
        result = BOOL;
        break;
      case 'Identifier': {
        const sym = lookup(scope, expr.name);
        if (!sym) {
          err(`Undefined variable \`${expr.name}\`.`, expr.span, 'sema/undefined');
          result = ERROR;
        } else if (sym.arraySize !== undefined) {
          err(
            `Array \`${expr.name}\` cannot be used as a value; index it with \`${expr.name}[i]\`.`,
            expr.span,
          );
          result = ERROR;
        } else {
          result = sym.type;
        }
        break;
      }
      case 'IndexExpression': {
        const sym = lookup(scope, expr.array.name);
        const idxType = typeOf(expr.index, scope);
        if (!sym) {
          err(`Undefined variable \`${expr.array.name}\`.`, expr.array.span, 'sema/undefined');
          result = ERROR;
        } else if (sym.arraySize === undefined) {
          err(`\`${expr.array.name}\` is not an array.`, expr.span);
          result = ERROR;
        } else {
          if (!typesEqual(idxType, INT)) err('Array index must be int.', expr.index.span);
          result = sym.type; // element type
        }
        break;
      }
      case 'UnaryExpression': {
        const operand = typeOf(expr.operand, scope);
        if (expr.operator === '-') {
          if (!typesEqual(operand, INT))
            err(`Operator \`-\` expects int but found ${typeName(operand)}.`, expr.span);
          result = INT;
        } else {
          if (!typesEqual(operand, BOOL))
            err(`Operator \`!\` expects bool but found ${typeName(operand)}.`, expr.span);
          result = BOOL;
        }
        break;
      }
      case 'BinaryExpression': {
        const left = typeOf(expr.left, scope);
        const right = typeOf(expr.right, scope);
        const op = expr.operator;
        if (op === '&&' || op === '||') {
          if (!typesEqual(left, BOOL) || !typesEqual(right, BOOL)) {
            err(`Operator \`${op}\` expects bool operands.`, expr.span);
          }
          result = BOOL;
        } else if (op === '==' || op === '!=') {
          if (!typesEqual(left, right)) {
            err(`Operator \`${op}\` expects matching operand types.`, expr.span);
          }
          result = BOOL;
        } else if (op === '<' || op === '<=' || op === '>' || op === '>=') {
          if (!typesEqual(left, INT) || !typesEqual(right, INT)) {
            err(`Operator \`${op}\` expects int operands.`, expr.span);
          }
          result = BOOL;
        } else {
          if (!typesEqual(left, INT) || !typesEqual(right, INT)) {
            err(`Operator \`${op}\` expects int operands.`, expr.span);
          }
          result = INT;
        }
        break;
      }
      case 'AssignmentExpression': {
        const targetName =
          expr.target.kind === 'Identifier' ? expr.target.name : expr.target.array.name;
        const sym = lookup(scope, targetName);
        const valueType = typeOf(expr.value, scope);
        if (expr.target.kind === 'IndexExpression') {
          const elemType = typeOf(expr.target, scope); // validates array + index, returns element type
          if (!typesEqual(elemType, valueType)) {
            err(`Cannot assign ${typeName(valueType)} to element of \`${targetName}\`.`, expr.span);
          }
          result = elemType;
        } else if (!sym) {
          err(`Undefined variable \`${targetName}\`.`, expr.target.span, 'sema/undefined');
          result = ERROR;
        } else if (sym.arraySize !== undefined) {
          err(`Cannot assign to array \`${targetName}\` as a whole.`, expr.span);
          result = ERROR;
        } else {
          types.set(expr.target.id, sym.type);
          if (!typesEqual(sym.type, valueType)) {
            err(
              `Cannot assign ${typeName(valueType)} to ${typeName(sym.type)} \`${targetName}\`.`,
              expr.span,
            );
          }
          result = sym.type;
        }
        break;
      }
      case 'CallExpression': {
        const fn = BUILTINS[expr.callee.name] ?? functions.get(expr.callee.name);
        for (const arg of expr.args) typeOf(arg, scope);
        if (!fn) {
          err(`Undefined function \`${expr.callee.name}\`.`, expr.callee.span, 'sema/undefined');
          result = ERROR;
        } else {
          if (expr.args.length !== fn.parameters.length) {
            err(
              `Function \`${fn.name}\` expects ${fn.parameters.length} argument(s) but received ${expr.args.length}.`,
              expr.span,
              'sema/arity',
            );
          } else {
            expr.args.forEach((arg, i) => {
              const argType = types.get(arg.id) ?? ERROR;
              const paramType = fn.parameters[i]?.type ?? ERROR;
              if (!typesEqual(argType, paramType)) {
                err(
                  `Argument ${i + 1} of \`${fn.name}\` expects ${typeName(paramType)} but found ${typeName(argType)}.`,
                  arg.span,
                );
              }
            });
          }
          result = fn.returnType;
        }
        break;
      }
    }
    types.set(expr.id, result);
    return result;
  };

  // --- Statement checking --------------------------------------------------
  const checkStatement = (stmt: StatementNode, scope: Scope, returnType: ToyType): void => {
    switch (stmt.kind) {
      case 'BlockStatement': {
        const child: Scope = { vars: new Map(), parent: scope };
        for (const s of stmt.statements) checkStatement(s, child, returnType);
        break;
      }
      case 'VariableDeclaration': {
        if (stmt.type.name === 'void') err('A variable cannot have type void.', stmt.type.span);
        if (scope.vars.has(stmt.name.name)) {
          err(
            `Duplicate declaration of \`${stmt.name.name}\` in this scope.`,
            stmt.name.span,
            'sema/duplicate',
          );
        }
        const declared = typeFromName(stmt.type.name);
        if (stmt.arraySize !== undefined) {
          if (stmt.arraySize <= 0) err('Array size must be positive.', stmt.span);
          scope.vars.set(stmt.name.name, {
            name: stmt.name.name,
            type: declared, // element type
            kind: 'local',
            arraySize: stmt.arraySize,
          });
          break;
        }
        if (stmt.initializer) {
          const initType = typeOf(stmt.initializer, scope);
          if (!typesEqual(declared, initType)) {
            err(
              `Cannot initialize ${typeName(declared)} \`${stmt.name.name}\` with ${typeName(initType)}.`,
              stmt.span,
            );
          }
        }
        scope.vars.set(stmt.name.name, { name: stmt.name.name, type: declared, kind: 'local' });
        break;
      }
      case 'IfStatement': {
        const cond = typeOf(stmt.condition, scope);
        if (!typesEqual(cond, BOOL)) err('An `if` condition must be bool.', stmt.condition.span);
        checkStatement(stmt.thenBranch, scope, returnType);
        if (stmt.elseBranch) checkStatement(stmt.elseBranch, scope, returnType);
        break;
      }
      case 'WhileStatement': {
        const cond = typeOf(stmt.condition, scope);
        if (!typesEqual(cond, BOOL)) err('A `while` condition must be bool.', stmt.condition.span);
        checkStatement(stmt.body, scope, returnType);
        break;
      }
      case 'ReturnStatement': {
        if (stmt.value) {
          const valueType = typeOf(stmt.value, scope);
          if (typesEqual(returnType, VOID)) {
            err('Cannot return a value from a void function.', stmt.span, 'sema/return');
          } else if (!typesEqual(returnType, valueType)) {
            err(
              `Function expects ${typeName(returnType)} but returns ${typeName(valueType)}.`,
              stmt.span,
              'sema/return',
            );
          }
        } else if (!typesEqual(returnType, VOID)) {
          err(
            `Function returning ${typeName(returnType)} must return a value.`,
            stmt.span,
            'sema/return',
          );
        }
        break;
      }
      case 'ExpressionStatement':
        typeOf(stmt.expression, scope);
        break;
    }
  };

  const alwaysReturns = (stmt: StatementNode): boolean => {
    switch (stmt.kind) {
      case 'ReturnStatement':
        return true;
      case 'BlockStatement':
        return stmt.statements.some(alwaysReturns);
      case 'IfStatement':
        return stmt.elseBranch
          ? alwaysReturns(stmt.thenBranch) && alwaysReturns(stmt.elseBranch)
          : false;
      default:
        return false;
    }
  };

  // Pass 2: check function bodies.
  const checkFunction = (decl: FunctionDeclarationNode): void => {
    const scope: Scope = { vars: new Map(), parent: null };
    for (const p of decl.parameters) {
      if (p.type.name === 'void') err('A parameter cannot have type void.', p.type.span);
      if (scope.vars.has(p.name.name)) {
        err(`Duplicate parameter \`${p.name.name}\`.`, p.name.span, 'sema/duplicate');
      }
      scope.vars.set(p.name.name, {
        name: p.name.name,
        type: typeFromName(p.type.name),
        kind: 'param',
      });
    }
    const returnType = typeFromName(decl.returnType.name);
    checkStatement(decl.body, scope, returnType);
    if (!typesEqual(returnType, VOID) && !alwaysReturns(decl.body)) {
      err(
        `Function \`${decl.name.name}\` returning ${typeName(returnType)} may not return a value on all paths.`,
        decl.name.span,
        'sema/return',
      );
    }
  };

  for (const decl of program.declarations) {
    if (decl.kind === 'FunctionDeclaration') checkFunction(decl);
    else if (decl.initializer) {
      const initType = typeOf(decl.initializer, { vars: new Map(), parent: null });
      const declared = typeFromName(decl.type.name);
      if (!typesEqual(declared, initType)) {
        err(
          `Cannot initialize ${typeName(declared)} \`${decl.name.name}\` with ${typeName(initType)}.`,
          decl.span,
        );
      }
    }
  }

  if (!functions.has('main')) {
    err(
      'Program has no `main` function.',
      program.span,
      'sema/no-main',
      'Define `int main() { ... }`.',
    );
  }

  return {
    diagnostics,
    types,
    symbols: { globals: [...globals.values()], functions: [...functions.values()] },
    functions,
  };
}
