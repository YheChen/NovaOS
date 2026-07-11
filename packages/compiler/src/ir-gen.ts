import { diagnostic, type Diagnostic, type SourceSpan } from '@novaos/shared';
import type { ExpressionNode, FunctionDeclarationNode, ProgramNode, StatementNode } from './ast';
import type { FunctionSymbol } from './semantics';
import { typeFromName, type ToyType, VOID, BOOL } from './types';
import type {
  IRBasicBlock,
  IRFunction,
  IRInstruction,
  IRModule,
  IRTerminator,
  IRValueId,
} from './ir';

interface BuildBlock {
  readonly id: number;
  readonly label: string;
  instructions: IRInstruction[];
  terminator: IRTerminator | null;
}

/** Lower a typed AST into the NovaIR. Assumes semantics already passed. */
export function generateIR(
  program: ProgramNode,
  functions: ReadonlyMap<string, FunctionSymbol>,
  globalNames: ReadonlySet<string>,
): IRModule {
  const diagnostics: Diagnostic[] = [];
  const irFunctions: IRFunction[] = [];

  if (globalNames.size > 0) {
    diagnostics.push(
      diagnostic({
        severity: 'error',
        code: 'ir/unsupported-global',
        message: `Global variables are not supported in Version 1 codegen (found: ${[...globalNames].join(', ')}).`,
        hint: 'Move the variable inside a function.',
      }),
    );
  }

  for (const decl of program.declarations) {
    if (decl.kind === 'FunctionDeclaration') {
      irFunctions.push(lowerFunction(decl, functions));
    }
  }

  return { functions: irFunctions, diagnostics };
}

function lowerFunction(
  decl: FunctionDeclarationNode,
  functions: ReadonlyMap<string, FunctionSymbol>,
): IRFunction {
  const locals: IRFunction['locals'] = [];
  const scopes: Array<Map<string, number>> = [new Map()];
  let nextTemp = 0;
  let nextBlock = 0;
  const blocks: BuildBlock[] = [];
  let current: BuildBlock | null = null;

  const freshTemp = (): IRValueId => nextTemp++;
  const declareLocal = (name: string, type: ToyType, isParam: boolean): number => {
    const id = locals.length;
    locals.push({ id, name, type, isParam });
    (scopes[scopes.length - 1] as Map<string, number>).set(name, id);
    return id;
  };
  const resolveLocal = (name: string): number | undefined => {
    for (let i = scopes.length - 1; i >= 0; i -= 1) {
      const found = scopes[i]?.get(name);
      if (found !== undefined) return found;
    }
    return undefined;
  };

  const newBlock = (suffix: string): BuildBlock => {
    const id = nextBlock++;
    const block: BuildBlock = {
      id,
      label: `${decl.name.name}_bb${id}_${suffix}`,
      instructions: [],
      terminator: null,
    };
    blocks.push(block);
    return block;
  };
  const ensureBlock = (): BuildBlock => {
    if (!current) current = newBlock('cont');
    return current;
  };
  const emit = (ins: IRInstruction): void => {
    ensureBlock().instructions.push(ins);
  };
  const terminate = (term: IRTerminator): void => {
    ensureBlock().terminator = term;
    current = null;
  };
  const startBlock = (block: BuildBlock): void => {
    current = block;
  };

  const returnTypeOf = (callee: string): ToyType =>
    callee === 'print' ? VOID : (functions.get(callee)?.returnType ?? VOID);

  // --- Expressions ---------------------------------------------------------
  const genExpr = (expr: ExpressionNode): IRValueId => {
    switch (expr.kind) {
      case 'IntegerLiteral': {
        const t = freshTemp();
        emit({ kind: 'const', target: t, value: expr.value, span: expr.span });
        return t;
      }
      case 'BooleanLiteral': {
        const t = freshTemp();
        emit({ kind: 'const', target: t, value: expr.value ? 1 : 0, span: expr.span });
        return t;
      }
      case 'Identifier': {
        const local = resolveLocal(expr.name);
        const t = freshTemp();
        if (local === undefined) {
          // Undefined identifiers are already reported by semantics; emit a 0.
          emit({ kind: 'const', target: t, value: 0, span: expr.span });
        } else {
          emit({ kind: 'load', target: t, local, span: expr.span });
        }
        return t;
      }
      case 'UnaryExpression': {
        const operand = genExpr(expr.operand);
        const t = freshTemp();
        emit({ kind: 'unary', op: expr.operator, target: t, operand, span: expr.span });
        return t;
      }
      case 'BinaryExpression': {
        if (expr.operator === '&&' || expr.operator === '||') {
          return genShortCircuit(expr.operator, expr.left, expr.right, expr.span);
        }
        const left = genExpr(expr.left);
        const right = genExpr(expr.right);
        const t = freshTemp();
        emit({ kind: 'binary', op: expr.operator, target: t, left, right, span: expr.span });
        return t;
      }
      case 'AssignmentExpression': {
        const value = genExpr(expr.value);
        const local = resolveLocal(expr.target.name);
        if (local !== undefined) emit({ kind: 'store', local, value, span: expr.span });
        return value;
      }
      case 'CallExpression': {
        if (expr.callee.name === 'print') {
          const value = genExpr(expr.args[0] as ExpressionNode);
          emit({ kind: 'print', value, span: expr.span });
          const t = freshTemp();
          emit({ kind: 'const', target: t, value: 0, span: expr.span });
          return t;
        }
        const args = expr.args.map((a) => genExpr(a));
        const isVoid = returnTypeOf(expr.callee.name).kind === 'void';
        const target = isVoid ? null : freshTemp();
        emit({ kind: 'call', target, callee: expr.callee.name, args, span: expr.span });
        if (target !== null) return target;
        const t = freshTemp();
        emit({ kind: 'const', target: t, value: 0, span: expr.span });
        return t;
      }
    }
  };

  // Short-circuit `&&` / `||`: evaluate the RHS only when needed, storing the
  // boolean result in a synthetic local. `a && b` => a ? b : 0; `a || b` => a ? 1 : b.
  const genShortCircuit = (
    op: '&&' | '||',
    leftNode: ExpressionNode,
    rightNode: ExpressionNode,
    span: SourceSpan,
  ): IRValueId => {
    const result = declareLocal(`$sc${nextTemp}`, BOOL, false);
    const a = genExpr(leftNode);
    const rhsBlk = newBlock('sc_rhs');
    const shortBlk = newBlock('sc_short');
    const doneBlk = newBlock('sc_done');
    terminate({
      kind: 'branch',
      condition: a,
      thenBlock: op === '&&' ? rhsBlk.id : shortBlk.id,
      elseBlock: op === '&&' ? shortBlk.id : rhsBlk.id,
      span,
    });

    startBlock(shortBlk);
    const c = freshTemp();
    emit({ kind: 'const', target: c, value: op === '&&' ? 0 : 1, span });
    emit({ kind: 'store', local: result, value: c, span });
    terminate({ kind: 'jump', target: doneBlk.id, span });

    startBlock(rhsBlk);
    const b = genExpr(rightNode);
    emit({ kind: 'store', local: result, value: b, span });
    terminate({ kind: 'jump', target: doneBlk.id, span });

    startBlock(doneBlk);
    const t = freshTemp();
    emit({ kind: 'load', target: t, local: result, span });
    return t;
  };

  // --- Statements ----------------------------------------------------------
  const genStmt = (stmt: StatementNode): void => {
    switch (stmt.kind) {
      case 'BlockStatement': {
        scopes.push(new Map());
        for (const s of stmt.statements) genStmt(s);
        scopes.pop();
        break;
      }
      case 'VariableDeclaration': {
        const local = declareLocal(stmt.name.name, typeFromName(stmt.type.name), false);
        const value = stmt.initializer ? genExpr(stmt.initializer) : zeroTemp(stmt.span);
        emit({ kind: 'store', local, value, span: stmt.span });
        break;
      }
      case 'ExpressionStatement':
        genExpr(stmt.expression);
        break;
      case 'ReturnStatement': {
        const value = stmt.value ? genExpr(stmt.value) : null;
        terminate({ kind: 'return', value, span: stmt.span });
        break;
      }
      case 'IfStatement': {
        const condition = genExpr(stmt.condition);
        const thenBlk = newBlock('then');
        const elseBlk = stmt.elseBranch ? newBlock('else') : null;
        const joinBlk = newBlock('endif');
        terminate({
          kind: 'branch',
          condition,
          thenBlock: thenBlk.id,
          elseBlock: (elseBlk ?? joinBlk).id,
          span: stmt.span,
        });
        startBlock(thenBlk);
        genStmt(stmt.thenBranch);
        terminate({ kind: 'jump', target: joinBlk.id, span: stmt.span });
        if (elseBlk && stmt.elseBranch) {
          startBlock(elseBlk);
          genStmt(stmt.elseBranch);
          terminate({ kind: 'jump', target: joinBlk.id, span: stmt.span });
        }
        startBlock(joinBlk);
        break;
      }
      case 'WhileStatement': {
        const headBlk = newBlock('while_head');
        const bodyBlk = newBlock('while_body');
        const exitBlk = newBlock('while_exit');
        terminate({ kind: 'jump', target: headBlk.id, span: stmt.span });
        startBlock(headBlk);
        const condition = genExpr(stmt.condition);
        terminate({
          kind: 'branch',
          condition,
          thenBlock: bodyBlk.id,
          elseBlock: exitBlk.id,
          span: stmt.span,
        });
        startBlock(bodyBlk);
        genStmt(stmt.body);
        terminate({ kind: 'jump', target: headBlk.id, span: stmt.span });
        startBlock(exitBlk);
        break;
      }
    }
  };

  const zeroTemp = (span: SourceSpan): IRValueId => {
    const t = freshTemp();
    emit({ kind: 'const', target: t, value: 0, span });
    return t;
  };

  // Parameters become the first locals (copied from the caller frame in codegen).
  for (const p of decl.parameters) declareLocal(p.name.name, typeFromName(p.type.name), true);

  startBlock(newBlock('entry'));
  genStmt(decl.body);
  // Fall-through with no explicit return: return void/0.
  if (current) terminate({ kind: 'return', value: null, span: decl.body.span });

  const finalBlocks: IRBasicBlock[] = blocks.map((b) => ({
    id: b.id,
    label: b.label,
    instructions: b.instructions,
    terminator: b.terminator ?? { kind: 'return', value: null, span: decl.body.span },
  }));

  return {
    name: decl.name.name,
    returnType: typeFromName(decl.returnType.name),
    locals,
    paramCount: decl.parameters.length,
    tempCount: nextTemp,
    blocks: finalBlocks,
    sourceSpan: decl.span,
  };
}
