import type { SourceSpan } from '@novaos/shared';

/** A stable, deterministic identifier assigned to every AST node (for source maps). */
export type AstNodeId = number;

export type TypeName = 'int' | 'bool' | 'void';

export interface TypeNode {
  readonly kind: 'Type';
  readonly id: AstNodeId;
  readonly name: TypeName;
  readonly span: SourceSpan;
}

export interface IdentifierNode {
  readonly kind: 'Identifier';
  readonly id: AstNodeId;
  readonly name: string;
  readonly span: SourceSpan;
}

export interface IntegerLiteralNode {
  readonly kind: 'IntegerLiteral';
  readonly id: AstNodeId;
  readonly value: number;
  readonly span: SourceSpan;
}

export interface BooleanLiteralNode {
  readonly kind: 'BooleanLiteral';
  readonly id: AstNodeId;
  readonly value: boolean;
  readonly span: SourceSpan;
}

export type BinaryOperator =
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | '=='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | '&&'
  | '||'
  | '&'
  | '|'
  | '^'
  | '<<'
  | '>>';

export interface BinaryExpressionNode {
  readonly kind: 'BinaryExpression';
  readonly id: AstNodeId;
  readonly operator: BinaryOperator;
  readonly left: ExpressionNode;
  readonly right: ExpressionNode;
  readonly span: SourceSpan;
}

export type UnaryOperator = '-' | '!';

export interface UnaryExpressionNode {
  readonly kind: 'UnaryExpression';
  readonly id: AstNodeId;
  readonly operator: UnaryOperator;
  readonly operand: ExpressionNode;
  readonly span: SourceSpan;
}

export interface AssignmentExpressionNode {
  readonly kind: 'AssignmentExpression';
  readonly id: AstNodeId;
  readonly target: IdentifierNode;
  readonly value: ExpressionNode;
  readonly span: SourceSpan;
}

export interface CallExpressionNode {
  readonly kind: 'CallExpression';
  readonly id: AstNodeId;
  readonly callee: IdentifierNode;
  readonly args: ExpressionNode[];
  readonly span: SourceSpan;
}

export type ExpressionNode =
  | BinaryExpressionNode
  | UnaryExpressionNode
  | AssignmentExpressionNode
  | CallExpressionNode
  | IdentifierNode
  | IntegerLiteralNode
  | BooleanLiteralNode;

export interface VariableDeclarationNode {
  readonly kind: 'VariableDeclaration';
  readonly id: AstNodeId;
  readonly name: IdentifierNode;
  readonly type: TypeNode;
  readonly initializer?: ExpressionNode;
  readonly span: SourceSpan;
}

export interface BlockStatementNode {
  readonly kind: 'BlockStatement';
  readonly id: AstNodeId;
  readonly statements: StatementNode[];
  readonly span: SourceSpan;
}

export interface IfStatementNode {
  readonly kind: 'IfStatement';
  readonly id: AstNodeId;
  readonly condition: ExpressionNode;
  readonly thenBranch: StatementNode;
  readonly elseBranch?: StatementNode;
  readonly span: SourceSpan;
}

export interface WhileStatementNode {
  readonly kind: 'WhileStatement';
  readonly id: AstNodeId;
  readonly condition: ExpressionNode;
  readonly body: StatementNode;
  readonly span: SourceSpan;
}

export interface ReturnStatementNode {
  readonly kind: 'ReturnStatement';
  readonly id: AstNodeId;
  readonly value?: ExpressionNode;
  readonly span: SourceSpan;
}

export interface ExpressionStatementNode {
  readonly kind: 'ExpressionStatement';
  readonly id: AstNodeId;
  readonly expression: ExpressionNode;
  readonly span: SourceSpan;
}

export type StatementNode =
  | BlockStatementNode
  | VariableDeclarationNode
  | IfStatementNode
  | WhileStatementNode
  | ReturnStatementNode
  | ExpressionStatementNode;

export interface ParameterNode {
  readonly kind: 'Parameter';
  readonly id: AstNodeId;
  readonly name: IdentifierNode;
  readonly type: TypeNode;
  readonly span: SourceSpan;
}

export interface FunctionDeclarationNode {
  readonly kind: 'FunctionDeclaration';
  readonly id: AstNodeId;
  readonly name: IdentifierNode;
  readonly parameters: ParameterNode[];
  readonly returnType: TypeNode;
  readonly body: BlockStatementNode;
  readonly span: SourceSpan;
}

export type DeclarationNode = FunctionDeclarationNode | VariableDeclarationNode;

export interface ProgramNode {
  readonly kind: 'Program';
  readonly id: AstNodeId;
  readonly declarations: DeclarationNode[];
  readonly span: SourceSpan;
}
