export type ToyType =
  | { readonly kind: 'int' }
  | { readonly kind: 'bool' }
  | { readonly kind: 'void' }
  | { readonly kind: 'error' };

export const INT: ToyType = { kind: 'int' };
export const BOOL: ToyType = { kind: 'bool' };
export const VOID: ToyType = { kind: 'void' };
export const ERROR: ToyType = { kind: 'error' };

export function typeName(type: ToyType): string {
  return type.kind;
}

/** Structural type equality. `error` unifies with anything to avoid cascades. */
export function typesEqual(a: ToyType, b: ToyType): boolean {
  if (a.kind === 'error' || b.kind === 'error') return true;
  return a.kind === b.kind;
}

export function typeFromName(name: 'int' | 'bool' | 'void'): ToyType {
  return name === 'int' ? INT : name === 'bool' ? BOOL : VOID;
}
