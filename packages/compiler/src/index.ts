/**
 * @novaos/compiler — the Toy C toolchain: lexer, parser, semantic analysis,
 * NovaIR, optimization passes, and NovaASM code generation. Pure and
 * deterministic; imports no UI and no VM runtime.
 */
export * from './tokens';
export * from './lexer';
export * from './ast';
export * from './types';
export * from './parser';
export * from './semantics';
export * from './ir';
export * from './ir-gen';
export * from './optimize';
export * from './codegen';
export * from './source-map';
export * from './compile';
export * from './inspector';

export const PACKAGE_NAME = '@novaos/compiler';
export const VERSION = '0.0.0';
