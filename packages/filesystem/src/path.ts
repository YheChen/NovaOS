import { ok, err } from '@novaos/shared';
import { absolutePath, type AbsolutePath, type InodeId, type UserId } from './ids';
import { fsError, type FsResult } from './errors';

export interface PathResolutionContext {
  readonly cwd: AbsolutePath;
  readonly home: AbsolutePath;
  readonly user: UserId;
  readonly followSymlinks: boolean;
}

export interface ResolvedPath {
  readonly absolutePath: AbsolutePath;
  readonly inodeId: InodeId | null;
  readonly parentId: InodeId | null;
  readonly basename: string;
}

/** Reject whitespace, null bytes, and other control characters in path input. */
function hasInvalidChars(input: string): boolean {
  if (/\s/.test(input)) return true;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/**
 * Canonicalize an input path against a cwd and home directory, applying the
 * rules from spec §8: collapse repeated slashes, resolve `.` and `..`, clamp at
 * root, expand `~`, preserve case, and reject empty names / control characters.
 */
export function canonicalize(
  input: string,
  cwd: AbsolutePath,
  home: AbsolutePath,
): FsResult<AbsolutePath> {
  if (input.length === 0) {
    return err(fsError('fs/invalid-path', 'Path cannot be empty.'));
  }
  if (hasInvalidChars(input)) {
    return err(fsError('fs/invalid-path', 'Path contains invalid characters.'));
  }

  let expanded = input;
  if (expanded === '~') {
    expanded = home;
  } else if (expanded.startsWith('~/')) {
    expanded = `${home}${expanded.slice(1)}`;
  }

  const base = expanded.startsWith('/') ? [] : segmentsOf(cwd);
  const segments = [...base];
  for (const part of expanded.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      segments.pop();
      continue;
    }
    segments.push(part);
  }

  return ok(absolutePath(segments.length === 0 ? '/' : `/${segments.join('/')}`));
}

export function segmentsOf(path: AbsolutePath): string[] {
  return path === '/' ? [] : path.slice(1).split('/');
}

export function basenameOf(path: AbsolutePath): string {
  const segments = segmentsOf(path);
  return segments.length === 0 ? '/' : (segments[segments.length - 1] as string);
}

export function dirnameOf(path: AbsolutePath): AbsolutePath {
  const segments = segmentsOf(path);
  segments.pop();
  return absolutePath(segments.length === 0 ? '/' : `/${segments.join('/')}`);
}

export function joinPath(parent: AbsolutePath, name: string): AbsolutePath {
  return absolutePath(parent === '/' ? `/${name}` : `${parent}/${name}`);
}
