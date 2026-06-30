export interface SourcePos {
  readonly line: number;
  readonly column: number;
}

export type AssemblyOperand =
  | {
      readonly kind: 'register';
      readonly name: string;
      readonly index: number;
      readonly pos: SourcePos;
    }
  | { readonly kind: 'immediate'; readonly value: number; readonly pos: SourcePos }
  | { readonly kind: 'label-ref'; readonly name: string; readonly pos: SourcePos };

export interface InstructionStatement {
  readonly kind: 'instruction';
  readonly mnemonic: string;
  readonly operands: AssemblyOperand[];
  readonly pos: SourcePos;
}

export interface LabelStatement {
  readonly kind: 'label';
  readonly name: string;
  readonly pos: SourcePos;
}

export interface DirectiveStatement {
  readonly kind: 'directive';
  readonly name: string;
  readonly args: string[];
  readonly pos: SourcePos;
}

export type AssemblyStatement = InstructionStatement | LabelStatement | DirectiveStatement;
