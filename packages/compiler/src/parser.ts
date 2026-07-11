import { diagnostic, type Diagnostic, type FileId, type SourceSpan } from '@novaos/shared';
import { lex } from './lexer';
import type { Token, TokenKind } from './tokens';
import type {
  AstNodeId,
  BinaryOperator,
  BlockStatementNode,
  DeclarationNode,
  ExpressionNode,
  FunctionDeclarationNode,
  IdentifierNode,
  ParameterNode,
  ProgramNode,
  StatementNode,
  TypeName,
  TypeNode,
  UnaryOperator,
  VariableDeclarationNode,
} from './ast';

export interface ParseResult {
  readonly program: ProgramNode;
  readonly diagnostics: Diagnostic[];
  readonly tokens: Token[];
  readonly comments: Token[];
}

class ParseError extends Error {}

const TYPE_NAMES = new Set<string>(['int', 'bool', 'void']);

export function parse(source: string, fileId?: FileId): ParseResult {
  const { tokens, comments, diagnostics } = lex(source, fileId);
  // Parser operates over non-comment tokens (comments are kept for display).
  const stream = tokens;
  let current = 0;
  let nextId: AstNodeId = 1;
  const id = (): AstNodeId => nextId++;

  const peek = (ahead = 0): Token => stream[Math.min(current + ahead, stream.length - 1)] as Token;
  const atEnd = (): boolean => peek().kind === 'eof';
  const previous = (): Token => stream[current - 1] as Token;

  const check = (kind: TokenKind, lexeme?: string): boolean => {
    const t = peek();
    return t.kind === kind && (lexeme === undefined || t.lexeme === lexeme);
  };
  const match = (kind: TokenKind, lexeme?: string): boolean => {
    if (check(kind, lexeme)) {
      current += 1;
      return true;
    }
    return false;
  };
  const advance = (): Token => {
    if (!atEnd()) current += 1;
    return previous();
  };

  const error = (token: Token, message: string, hint?: string): ParseError => {
    diagnostics.push(
      diagnostic({
        severity: 'error',
        code: 'parse/unexpected-token',
        message,
        source: { line: token.span.start.line, column: token.span.start.column },
        ...(hint ? { hint } : {}),
      }),
    );
    return new ParseError(message);
  };

  const expect = (kind: TokenKind, lexeme: string, what: string): Token => {
    if (check(kind, lexeme)) return advance();
    throw error(peek(), `Expected ${what}.`, `Insert \`${lexeme}\`.`);
  };

  const spanBetween = (start: SourceSpan, end: SourceSpan): SourceSpan =>
    start.fileId === undefined
      ? { start: start.start, end: end.end }
      : { fileId: start.fileId, start: start.start, end: end.end };

  // --- Types ---------------------------------------------------------------
  const parseType = (): TypeNode => {
    const t = peek();
    if (t.kind === 'keyword' && TYPE_NAMES.has(t.lexeme)) {
      advance();
      return { kind: 'Type', id: id(), name: t.lexeme as TypeName, span: t.span };
    }
    throw error(t, `Expected a type (int, bool, or void).`);
  };

  const parseIdentifier = (): IdentifierNode => {
    const t = peek();
    if (t.kind === 'identifier') {
      advance();
      return { kind: 'Identifier', id: id(), name: t.lexeme, span: t.span };
    }
    throw error(t, `Expected an identifier.`);
  };

  // --- Expressions (precedence climbing) -----------------------------------
  const parseExpression = (): ExpressionNode => parseAssignment();

  const COMPOUND: Record<string, BinaryOperator> = {
    '+=': '+',
    '-=': '-',
    '*=': '*',
    '/=': '/',
    '%=': '%',
  };

  const parseAssignment = (): ExpressionNode => {
    const left = parseLogicOr();
    const t = peek();
    const isCompound = t.kind === 'operator' && t.lexeme in COMPOUND;
    if (check('operator', '=') || isCompound) {
      const op = advance();
      const value = parseAssignment();
      if (left.kind !== 'Identifier') {
        throw error(op, 'Invalid assignment target.', 'The left side of `=` must be a variable.');
      }
      if (op.lexeme === '=') {
        return {
          kind: 'AssignmentExpression',
          id: id(),
          target: left,
          value,
          span: spanBetween(left.span, value.span),
        };
      }
      // Desugar `x += e` into `x = x + e`.
      const baseOp = COMPOUND[op.lexeme] as BinaryOperator;
      const readTarget: ExpressionNode = {
        kind: 'Identifier',
        id: id(),
        name: left.name,
        span: left.span,
      };
      const combined: ExpressionNode = {
        kind: 'BinaryExpression',
        id: id(),
        operator: baseOp,
        left: readTarget,
        right: value,
        span: spanBetween(left.span, value.span),
      };
      return {
        kind: 'AssignmentExpression',
        id: id(),
        target: left,
        value: combined,
        span: spanBetween(left.span, value.span),
      };
    }
    return left;
  };

  const binaryLevel = (next: () => ExpressionNode, operators: string[]): ExpressionNode => {
    let left = next();
    while (check('operator') && operators.includes(peek().lexeme)) {
      const op = advance();
      const right = next();
      left = {
        kind: 'BinaryExpression',
        id: id(),
        operator: op.lexeme as BinaryOperator,
        left,
        right,
        span: spanBetween(left.span, right.span),
      };
    }
    return left;
  };

  const parseLogicOr = (): ExpressionNode => binaryLevel(parseLogicAnd, ['||']);
  const parseLogicAnd = (): ExpressionNode => binaryLevel(parseEquality, ['&&']);
  const parseEquality = (): ExpressionNode => binaryLevel(parseComparison, ['==', '!=']);
  const parseComparison = (): ExpressionNode => binaryLevel(parseTerm, ['<', '<=', '>', '>=']);
  const parseTerm = (): ExpressionNode => binaryLevel(parseFactor, ['+', '-']);
  const parseFactor = (): ExpressionNode => binaryLevel(parseUnary, ['*', '/', '%']);

  const parseUnary = (): ExpressionNode => {
    if (check('operator', '!') || check('operator', '-')) {
      const op = advance();
      const operand = parseUnary();
      return {
        kind: 'UnaryExpression',
        id: id(),
        operator: op.lexeme as UnaryOperator,
        operand,
        span: spanBetween(op.span, operand.span),
      };
    }
    return parseCall();
  };

  const parseCall = (): ExpressionNode => {
    let expr = parsePrimary();
    while (check('punctuation', '(')) {
      if (expr.kind !== 'Identifier') {
        throw error(peek(), 'Only named functions can be called.');
      }
      advance(); // (
      const args: ExpressionNode[] = [];
      if (!check('punctuation', ')')) {
        do {
          args.push(parseExpression());
        } while (match('punctuation', ','));
      }
      const close = expect('punctuation', ')', '`)` after arguments');
      expr = {
        kind: 'CallExpression',
        id: id(),
        callee: expr,
        args,
        span: spanBetween(expr.span, close.span),
      };
    }
    return expr;
  };

  const parsePrimary = (): ExpressionNode => {
    const t = peek();
    if (t.kind === 'integer') {
      advance();
      return { kind: 'IntegerLiteral', id: id(), value: t.value ?? 0, span: t.span };
    }
    if (t.kind === 'keyword' && (t.lexeme === 'true' || t.lexeme === 'false')) {
      advance();
      return { kind: 'BooleanLiteral', id: id(), value: t.lexeme === 'true', span: t.span };
    }
    if (t.kind === 'identifier' || (t.kind === 'keyword' && t.lexeme === 'print')) {
      // `print` is a builtin callee; treat it as an identifier name.
      advance();
      return { kind: 'Identifier', id: id(), name: t.lexeme, span: t.span };
    }
    if (match('punctuation', '(')) {
      const expr = parseExpression();
      expect('punctuation', ')', '`)` to close the expression');
      return expr;
    }
    throw error(t, `Expected an expression.`);
  };

  // --- Statements ----------------------------------------------------------
  const parseBlock = (): BlockStatementNode => {
    const open = expect('punctuation', '{', '`{`');
    const statements: StatementNode[] = [];
    while (!check('punctuation', '}') && !atEnd()) {
      const before = current;
      const stmt = parseStatementRecovering();
      if (stmt) statements.push(stmt);
      if (current === before) advance(); // guarantee progress on unrecoverable input
    }
    const close = expect('punctuation', '}', '`}` to close the block');
    return {
      kind: 'BlockStatement',
      id: id(),
      statements,
      span: spanBetween(open.span, close.span),
    };
  };

  const parseVarDecl = (): VariableDeclarationNode => {
    const type = parseType();
    const name = parseIdentifier();
    let initializer: ExpressionNode | undefined;
    if (match('operator', '=')) initializer = parseExpression();
    const semi = expect('punctuation', ';', '`;` after the declaration');
    return {
      kind: 'VariableDeclaration',
      id: id(),
      name,
      type,
      ...(initializer ? { initializer } : {}),
      span: spanBetween(type.span, semi.span),
    };
  };

  const parseStatement = (): StatementNode => {
    if (check('punctuation', '{')) return parseBlock();
    if (check('keyword', 'if')) return parseIf();
    if (check('keyword', 'while')) return parseWhile();
    if (check('keyword', 'for')) return parseFor();
    if (check('keyword', 'return')) return parseReturn();
    if (peek().kind === 'keyword' && TYPE_NAMES.has(peek().lexeme)) return parseVarDecl();
    const expr = parseExpression();
    const semi = expect('punctuation', ';', '`;` after the expression');
    return {
      kind: 'ExpressionStatement',
      id: id(),
      expression: expr,
      span: spanBetween(expr.span, semi.span),
    };
  };

  const parseIf = (): StatementNode => {
    const kw = advance();
    expect('punctuation', '(', '`(` after `if`');
    const condition = parseExpression();
    expect('punctuation', ')', '`)` after the condition');
    const thenBranch = parseStatement();
    let elseBranch: StatementNode | undefined;
    if (match('keyword', 'else')) elseBranch = parseStatement();
    return {
      kind: 'IfStatement',
      id: id(),
      condition,
      thenBranch,
      ...(elseBranch ? { elseBranch } : {}),
      span: spanBetween(kw.span, (elseBranch ?? thenBranch).span),
    };
  };

  const parseWhile = (): StatementNode => {
    const kw = advance();
    expect('punctuation', '(', '`(` after `while`');
    const condition = parseExpression();
    expect('punctuation', ')', '`)` after the condition');
    const body = parseStatement();
    return {
      kind: 'WhileStatement',
      id: id(),
      condition,
      body,
      span: spanBetween(kw.span, body.span),
    };
  };

  // Desugar `for (init; cond; update) body` into `{ init; while (cond) { body; update; } }`.
  const parseFor = (): StatementNode => {
    const kw = advance(); // for
    expect('punctuation', '(', '`(` after `for`');
    let init: StatementNode | null = null;
    if (match('punctuation', ';')) {
      // no initializer
    } else if (peek().kind === 'keyword' && TYPE_NAMES.has(peek().lexeme)) {
      init = parseVarDecl();
    } else {
      const expr = parseExpression();
      const semi = expect('punctuation', ';', '`;` after the loop initializer');
      init = {
        kind: 'ExpressionStatement',
        id: id(),
        expression: expr,
        span: spanBetween(expr.span, semi.span),
      };
    }
    let condition: ExpressionNode | null = null;
    if (!check('punctuation', ';')) condition = parseExpression();
    expect('punctuation', ';', '`;` after the loop condition');
    let update: ExpressionNode | null = null;
    if (!check('punctuation', ')')) update = parseExpression();
    const close = expect('punctuation', ')', '`)` after the for-clauses');
    const body = parseStatement();

    const cond: ExpressionNode = condition ?? {
      kind: 'BooleanLiteral',
      id: id(),
      value: true,
      span: kw.span,
    };
    const whileBodyStatements: StatementNode[] = [body];
    if (update) {
      whileBodyStatements.push({
        kind: 'ExpressionStatement',
        id: id(),
        expression: update,
        span: update.span,
      });
    }
    const whileStmt: StatementNode = {
      kind: 'WhileStatement',
      id: id(),
      condition: cond,
      body: { kind: 'BlockStatement', id: id(), statements: whileBodyStatements, span: body.span },
      span: spanBetween(kw.span, body.span),
    };
    const outer: StatementNode[] = init ? [init, whileStmt] : [whileStmt];
    return {
      kind: 'BlockStatement',
      id: id(),
      statements: outer,
      span: spanBetween(kw.span, close.span),
    };
  };

  const parseReturn = (): StatementNode => {
    const kw = advance();
    let value: ExpressionNode | undefined;
    if (!check('punctuation', ';')) value = parseExpression();
    const semi = expect('punctuation', ';', '`;` after the return statement');
    return {
      kind: 'ReturnStatement',
      id: id(),
      ...(value ? { value } : {}),
      span: spanBetween(kw.span, semi.span),
    };
  };

  const synchronize = (): void => {
    while (!atEnd()) {
      const prev = current > 0 ? stream[current - 1] : undefined;
      if (prev && (prev.lexeme === ';' || prev.lexeme === '}')) return;
      const t = peek();
      if (
        t.kind === 'keyword' &&
        (TYPE_NAMES.has(t.lexeme) ||
          t.lexeme === 'if' ||
          t.lexeme === 'while' ||
          t.lexeme === 'return')
      ) {
        return;
      }
      if (t.kind === 'punctuation' && t.lexeme === '}') return;
      advance();
    }
  };

  const parseStatementRecovering = (): StatementNode | null => {
    try {
      return parseStatement();
    } catch (e) {
      if (e instanceof ParseError) {
        synchronize();
        return null;
      }
      throw e;
    }
  };

  // --- Declarations --------------------------------------------------------
  const parseDeclaration = (): DeclarationNode => {
    const type = parseType();
    const name = parseIdentifier();
    if (check('punctuation', '(')) {
      // function declaration
      advance();
      const parameters: ParameterNode[] = [];
      if (!check('punctuation', ')')) {
        do {
          const pType = parseType();
          const pName = parseIdentifier();
          parameters.push({
            kind: 'Parameter',
            id: id(),
            name: pName,
            type: pType,
            span: spanBetween(pType.span, pName.span),
          });
        } while (match('punctuation', ','));
      }
      expect('punctuation', ')', '`)` after parameters');
      const body = parseBlock();
      const fn: FunctionDeclarationNode = {
        kind: 'FunctionDeclaration',
        id: id(),
        name,
        parameters,
        returnType: type,
        body,
        span: spanBetween(type.span, body.span),
      };
      return fn;
    }
    // global variable declaration
    let initializer: ExpressionNode | undefined;
    if (match('operator', '=')) initializer = parseExpression();
    const semi = expect('punctuation', ';', '`;` after the declaration');
    return {
      kind: 'VariableDeclaration',
      id: id(),
      name,
      type,
      ...(initializer ? { initializer } : {}),
      span: spanBetween(type.span, semi.span),
    };
  };

  // --- Program -------------------------------------------------------------
  const startSpan = peek().span;
  const declarations: DeclarationNode[] = [];
  while (!atEnd()) {
    const before = current;
    try {
      declarations.push(parseDeclaration());
    } catch (e) {
      if (e instanceof ParseError) {
        synchronize();
      } else {
        throw e;
      }
    }
    if (current === before) advance(); // guarantee progress on unrecoverable input
  }
  const endSpan = previous()?.span ?? startSpan;
  const program: ProgramNode = {
    kind: 'Program',
    id: id(),
    declarations,
    span: spanBetween(startSpan, endSpan),
  };

  return { program, diagnostics, tokens, comments };
}
