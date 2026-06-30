import { describe, it, expect } from 'vitest';
import { canonicalize, basenameOf, dirnameOf, joinPath } from './path';
import { absolutePath } from './ids';

const cwd = absolutePath('/home/student');
const home = absolutePath('/home/student');

const resolve = (input: string) => {
  const r = canonicalize(input, cwd, home);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};

describe('canonicalize', () => {
  it('resolves absolute paths', () => {
    expect(resolve('/bin')).toBe('/bin');
    expect(resolve('/')).toBe('/');
  });

  it('resolves relative paths against cwd', () => {
    expect(resolve('demos')).toBe('/home/student/demos');
    expect(resolve('demos/hello.asm')).toBe('/home/student/demos/hello.asm');
  });

  it('resolves "." and ".."', () => {
    expect(resolve('.')).toBe('/home/student');
    expect(resolve('..')).toBe('/home');
    expect(resolve('../..')).toBe('/');
    expect(resolve('./demos/../notes')).toBe('/home/student/notes');
  });

  it('expands "~"', () => {
    expect(resolve('~')).toBe('/home/student');
    expect(resolve('~/projects')).toBe('/home/student/projects');
  });

  it('collapses repeated slashes and clamps at root', () => {
    expect(resolve('//bin///cat')).toBe('/bin/cat');
    expect(resolve('/../../..')).toBe('/');
  });

  it('rejects empty and invalid paths', () => {
    expect(canonicalize('', cwd, home).ok).toBe(false);
    expect(canonicalize('a b', cwd, home).ok).toBe(false);
  });
});

describe('path helpers', () => {
  it('computes basename and dirname', () => {
    expect(basenameOf(absolutePath('/home/student/main.asm'))).toBe('main.asm');
    expect(dirnameOf(absolutePath('/home/student/main.asm'))).toBe('/home/student');
    expect(dirnameOf(absolutePath('/home'))).toBe('/');
  });

  it('joins paths', () => {
    expect(joinPath(absolutePath('/'), 'bin')).toBe('/bin');
    expect(joinPath(absolutePath('/home'), 'student')).toBe('/home/student');
  });
});
