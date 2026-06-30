import type { SimTime } from '@novaos/shared';
import type { EventInput } from '@novaos/events';
import type { AbsolutePath, InodeId } from './ids';

export const FileSystemEventType = {
  FileCreated: 'filesystem.file.created',
  FileRead: 'filesystem.file.read',
  FileWritten: 'filesystem.file.written',
  FileDeleted: 'filesystem.file.deleted',
  DirectoryCreated: 'filesystem.directory.created',
  DirectoryDeleted: 'filesystem.directory.deleted',
  Moved: 'filesystem.moved',
  Copied: 'filesystem.copied',
} as const;

const fsEvent = (type: string, tick: SimTime, payload: unknown): EventInput => ({
  type,
  tick,
  source: 'filesystem',
  payload,
});

export const fileCreatedEvent = (tick: SimTime, path: AbsolutePath, inodeId: InodeId): EventInput =>
  fsEvent(FileSystemEventType.FileCreated, tick, { path, inodeId });

export const fileReadEvent = (
  tick: SimTime,
  path: AbsolutePath,
  inodeId: InodeId,
  bytes: number,
): EventInput => fsEvent(FileSystemEventType.FileRead, tick, { path, inodeId, bytes });

export const fileWrittenEvent = (
  tick: SimTime,
  path: AbsolutePath,
  inodeId: InodeId,
  bytes: number,
): EventInput => fsEvent(FileSystemEventType.FileWritten, tick, { path, inodeId, bytes });

export const fileDeletedEvent = (tick: SimTime, path: AbsolutePath): EventInput =>
  fsEvent(FileSystemEventType.FileDeleted, tick, { path });

export const directoryCreatedEvent = (
  tick: SimTime,
  path: AbsolutePath,
  inodeId: InodeId,
): EventInput => fsEvent(FileSystemEventType.DirectoryCreated, tick, { path, inodeId });

export const directoryDeletedEvent = (tick: SimTime, path: AbsolutePath): EventInput =>
  fsEvent(FileSystemEventType.DirectoryDeleted, tick, { path });

export const movedEvent = (tick: SimTime, from: AbsolutePath, to: AbsolutePath): EventInput =>
  fsEvent(FileSystemEventType.Moved, tick, { from, to });

export const copiedEvent = (tick: SimTime, from: AbsolutePath, to: AbsolutePath): EventInput =>
  fsEvent(FileSystemEventType.Copied, tick, { from, to });
