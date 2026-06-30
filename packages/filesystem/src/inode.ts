import type { InodeId, ContentRef, UserId, GroupId } from './ids';
import type { FilePermissions } from './permissions';

export type InodeKind = 'file' | 'directory' | 'device' | 'symlink';

export interface BaseInode {
  readonly id: InodeId;
  readonly kind: InodeKind;
  name: string;
  parentId: InodeId | null;
  owner: UserId;
  group: GroupId;
  permissions: FilePermissions;
  readonly createdAtTick: number;
  modifiedAtTick: number;
  accessedAtTick: number;
  sizeBytes: number;
}

export interface FileInode extends BaseInode {
  readonly kind: 'file';
  contentRef: ContentRef;
  mimeType: string;
  encoding: 'utf-8' | 'binary';
}

export interface DirectoryInode extends BaseInode {
  readonly kind: 'directory';
  children: Map<string, InodeId>;
}

export interface DeviceInode extends BaseInode {
  readonly kind: 'device';
  deviceKind: 'terminal' | 'null' | 'random';
}

export type Inode = FileInode | DirectoryInode | DeviceInode;

export const isFile = (inode: Inode): inode is FileInode => inode.kind === 'file';
export const isDirectory = (inode: Inode): inode is DirectoryInode => inode.kind === 'directory';
