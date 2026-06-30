import type { Brand } from '@novaos/shared';

export type InodeId = Brand<number, 'InodeId'>;
export type ContentRef = Brand<string, 'ContentRef'>;
export type UserId = Brand<string, 'UserId'>;
export type GroupId = Brand<string, 'GroupId'>;

/** A path as typed by the user (may be relative). */
export type Path = Brand<string, 'Path'>;
/** A canonical, resolved absolute path (no `.`/`..`, no trailing slash except root). */
export type AbsolutePath = Brand<string, 'AbsolutePath'>;

export const inodeId = (n: number): InodeId => n as InodeId;
export const contentRef = (s: string): ContentRef => s as ContentRef;
export const userId = (s: string): UserId => s as UserId;
export const groupId = (s: string): GroupId => s as GroupId;
export const absolutePath = (s: string): AbsolutePath => s as AbsolutePath;

export const ROOT_PATH = absolutePath('/');
export const DEFAULT_USER = userId('student');
export const DEFAULT_GROUP = groupId('students');
export const DEFAULT_HOME = absolutePath('/home/student');
