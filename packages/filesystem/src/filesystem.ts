import { ok, err, type SimulationClock } from '@novaos/shared';
import type { EventBus } from '@novaos/events';
import {
  inodeId,
  contentRef,
  userId,
  groupId,
  DEFAULT_USER,
  DEFAULT_GROUP,
  DEFAULT_HOME,
  ROOT_PATH,
  type InodeId,
  type AbsolutePath,
  type UserId,
} from './ids';
import {
  defaultDirectoryPermissions,
  defaultFilePermissions,
  readOnlyDirectoryPermissions,
  formatPermissions,
  type FilePermissions,
} from './permissions';
import {
  isDirectory,
  isFile,
  type Inode,
  type DirectoryInode,
  type FileInode,
  type InodeKind,
} from './inode';
import {
  createContentStore,
  type ContentStoreSnapshot,
  type FileContentStore,
} from './content-store';
import { canonicalize, segmentsOf, joinPath, type ResolvedPath } from './path';
import { fsError, type FsResult } from './errors';
import * as events from './events';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface FsContext {
  readonly user: UserId;
  readonly cwd: AbsolutePath;
  readonly mode?: 'kernel' | 'user';
  readonly pid?: number | null;
}

export interface DirectoryEntry {
  readonly name: string;
  readonly kind: InodeKind;
  readonly sizeBytes: number;
  readonly permissions: string;
}

export interface InodeStat {
  readonly path: AbsolutePath;
  readonly name: string;
  readonly kind: InodeKind;
  readonly sizeBytes: number;
  readonly permissions: string;
  readonly owner: UserId;
  readonly createdAtTick: number;
  readonly modifiedAtTick: number;
}

export interface SerializedInode {
  id: number;
  kind: InodeKind;
  name: string;
  parentId: number | null;
  owner: string;
  group: string;
  permissions: FilePermissions;
  createdAtTick: number;
  modifiedAtTick: number;
  accessedAtTick: number;
  sizeBytes: number;
  contentRef?: string;
  mimeType?: string;
  encoding?: 'utf-8' | 'binary';
  children?: Record<string, number>;
}

export interface FileSystemSnapshot {
  readonly version: number;
  readonly rootInodeId: number;
  readonly nextInodeId: number;
  readonly inodes: SerializedInode[];
  readonly contentStore: ContentStoreSnapshot;
}

export interface CreateFileOptions {
  readonly overwrite?: boolean;
  readonly content?: Uint8Array;
}
export interface CreateDirectoryOptions {
  readonly recursive?: boolean;
}
export interface RemoveOptions {
  readonly recursive?: boolean;
  readonly force?: boolean;
}

export interface FileSystem {
  resolve(path: string, context: FsContext): FsResult<ResolvedPath>;
  stat(path: string, context: FsContext): FsResult<InodeStat>;
  list(path: string, context: FsContext): FsResult<DirectoryEntry[]>;
  readFile(path: string, context: FsContext): FsResult<Uint8Array>;
  readText(path: string, context: FsContext): FsResult<string>;
  writeFile(path: string, bytes: Uint8Array, context: FsContext): FsResult<void>;
  writeText(path: string, content: string, context: FsContext): FsResult<void>;
  appendFile(path: string, bytes: Uint8Array, context: FsContext): FsResult<void>;
  createFile(path: string, options: CreateFileOptions, context: FsContext): FsResult<InodeId>;
  createDirectory(
    path: string,
    options: CreateDirectoryOptions,
    context: FsContext,
  ): FsResult<InodeId>;
  remove(path: string, options: RemoveOptions, context: FsContext): FsResult<void>;
  move(from: string, to: string, context: FsContext): FsResult<void>;
  copy(from: string, to: string, context: FsContext): FsResult<InodeId>;
  snapshot(): FileSystemSnapshot;
  restore(snapshot: FileSystemSnapshot): FsResult<void>;
}

export interface CreateFileSystemDeps {
  readonly clock: SimulationClock;
  readonly bus?: EventBus;
  readonly home?: AbsolutePath;
}

const SNAPSHOT_VERSION = 1;

export function createFileSystem(deps: CreateFileSystemDeps): FileSystem {
  const clock = deps.clock;
  const bus = deps.bus;
  const home = deps.home ?? DEFAULT_HOME;

  let inodes = new Map<InodeId, Inode>();
  let nextId = 1;
  let rootId: InodeId;

  const now = () => clock.now();
  const publish = (event: ReturnType<typeof events.fileCreatedEvent>) => {
    if (bus) bus.publish(event);
  };

  function allocId(): InodeId {
    const id = inodeId(nextId);
    nextId += 1;
    return id;
  }

  function makeDir(name: string, parentId: InodeId | null, permissions: FilePermissions): InodeId {
    const id = allocId();
    const dir: DirectoryInode = {
      id,
      kind: 'directory',
      name,
      parentId,
      owner: DEFAULT_USER,
      group: DEFAULT_GROUP,
      permissions,
      createdAtTick: now(),
      modifiedAtTick: now(),
      accessedAtTick: now(),
      sizeBytes: 0,
      children: new Map(),
    };
    inodes.set(id, dir);
    return id;
  }

  function makeFile(name: string, parentId: InodeId, content: Uint8Array): InodeId {
    const id = allocId();
    const ref = contentStore.create(content);
    const file: FileInode = {
      id,
      kind: 'file',
      name,
      parentId,
      owner: DEFAULT_USER,
      group: DEFAULT_GROUP,
      permissions: defaultFilePermissions(),
      createdAtTick: now(),
      modifiedAtTick: now(),
      accessedAtTick: now(),
      sizeBytes: content.length,
      contentRef: ref,
      mimeType: 'text/plain',
      encoding: 'utf-8',
    };
    inodes.set(id, file);
    return id;
  }

  const contentStore: FileContentStore = createContentStore();

  function canWrite(inode: Inode, user: UserId): boolean {
    return inode.owner === user ? inode.permissions.owner.write : inode.permissions.other.write;
  }
  function canRead(inode: Inode, user: UserId): boolean {
    return inode.owner === user ? inode.permissions.owner.read : inode.permissions.other.read;
  }

  function resolve(path: string, context: FsContext): FsResult<ResolvedPath> {
    const canonical = canonicalize(path, context.cwd, home);
    if (!canonical.ok) return canonical;
    const abs = canonical.value;
    const segments = segmentsOf(abs);
    if (segments.length === 0) {
      return ok({ absolutePath: abs, inodeId: rootId, parentId: null, basename: '/' });
    }

    let parentId = rootId;
    for (let i = 0; i < segments.length - 1; i += 1) {
      const dir = inodes.get(parentId);
      if (!dir || !isDirectory(dir)) {
        return err(fsError('fs/not-a-directory', `Not a directory: ${segments[i]}`, { path: abs }));
      }
      const next = dir.children.get(segments[i] as string);
      if (next === undefined) {
        return err(fsError('fs/not-found', `No such file or directory: ${abs}`, { path: abs }));
      }
      parentId = next;
    }

    const parentDir = inodes.get(parentId);
    if (!parentDir || !isDirectory(parentDir)) {
      return err(fsError('fs/not-a-directory', `Not a directory: ${abs}`, { path: abs }));
    }
    const basename = segments[segments.length - 1] as string;
    const childId = parentDir.children.get(basename) ?? null;
    return ok({ absolutePath: abs, inodeId: childId, parentId, basename });
  }

  function statInode(inode: Inode, path: AbsolutePath): InodeStat {
    return {
      path,
      name: inode.name,
      kind: inode.kind,
      sizeBytes: inode.sizeBytes,
      permissions: formatPermissions(inode.permissions),
      owner: inode.owner,
      createdAtTick: inode.createdAtTick,
      modifiedAtTick: inode.modifiedAtTick,
    };
  }

  function notFound(path: AbsolutePath) {
    return err(
      fsError('fs/not-found', `No such file or directory: ${path}`, {
        path,
        hint: `Run \`ls ${path === ROOT_PATH ? '/' : '.'}\` to see available files.`,
      }),
    );
  }

  const fs: FileSystem = {
    resolve,

    stat(path, context) {
      const resolved = resolve(path, context);
      if (!resolved.ok) return resolved;
      if (resolved.value.inodeId === null) return notFound(resolved.value.absolutePath);
      const inode = inodes.get(resolved.value.inodeId);
      if (!inode) return notFound(resolved.value.absolutePath);
      return ok(statInode(inode, resolved.value.absolutePath));
    },

    list(path, context) {
      const resolved = resolve(path, context);
      if (!resolved.ok) return resolved;
      if (resolved.value.inodeId === null) return notFound(resolved.value.absolutePath);
      const inode = inodes.get(resolved.value.inodeId);
      if (!inode) return notFound(resolved.value.absolutePath);
      if (!isDirectory(inode)) {
        return err(
          fsError('fs/not-a-directory', `Not a directory: ${resolved.value.absolutePath}`, {
            path: resolved.value.absolutePath,
          }),
        );
      }
      const entries: DirectoryEntry[] = [];
      for (const childId of inode.children.values()) {
        const child = inodes.get(childId);
        if (!child) continue;
        entries.push({
          name: child.name,
          kind: child.kind,
          sizeBytes: child.sizeBytes,
          permissions: formatPermissions(child.permissions),
        });
      }
      entries.sort((a, b) => {
        if (a.kind === 'directory' && b.kind !== 'directory') return -1;
        if (a.kind !== 'directory' && b.kind === 'directory') return 1;
        return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
      });
      return ok(entries);
    },

    readFile(path, context) {
      const resolved = resolve(path, context);
      if (!resolved.ok) return resolved;
      if (resolved.value.inodeId === null) return notFound(resolved.value.absolutePath);
      const inode = inodes.get(resolved.value.inodeId);
      if (!inode) return notFound(resolved.value.absolutePath);
      if (!isFile(inode)) {
        return err(
          fsError('fs/not-a-file', `Not a file: ${resolved.value.absolutePath}`, {
            path: resolved.value.absolutePath,
          }),
        );
      }
      if (!canRead(inode, context.user)) {
        return err(
          fsError('fs/permission-denied', `Permission denied: ${resolved.value.absolutePath}`, {
            path: resolved.value.absolutePath,
          }),
        );
      }
      const content = contentStore.read(inode.contentRef);
      if (!content.ok) return content;
      inode.accessedAtTick = now();
      publish(
        events.fileReadEvent(now(), resolved.value.absolutePath, inode.id, content.value.length),
      );
      return ok(content.value);
    },

    readText(path, context) {
      const bytes = fs.readFile(path, context);
      return bytes.ok ? ok(decoder.decode(bytes.value)) : bytes;
    },

    writeFile(path, bytes, context) {
      const resolved = resolve(path, context);
      if (!resolved.ok) return resolved;
      const { absolutePath: abs, inodeId: existingId } = resolved.value;
      if (existingId !== null) {
        const inode = inodes.get(existingId);
        if (!inode || !isFile(inode)) {
          return err(fsError('fs/not-a-file', `Not a file: ${abs}`, { path: abs }));
        }
        if (!canWrite(inode, context.user)) {
          return err(fsError('fs/permission-denied', `Permission denied: ${abs}`, { path: abs }));
        }
        contentStore.write(inode.contentRef, bytes);
        inode.sizeBytes = bytes.length;
        inode.modifiedAtTick = now();
        publish(events.fileWrittenEvent(now(), abs, inode.id, bytes.length));
        return ok(undefined);
      }
      const created = fs.createFile(path, { content: bytes }, context);
      return created.ok ? ok(undefined) : created;
    },

    writeText(path, content, context) {
      return fs.writeFile(path, encoder.encode(content), context);
    },

    appendFile(path, bytes, context) {
      const existing = fs.readFile(path, context);
      if (!existing.ok) {
        return fs.writeFile(path, bytes, context);
      }
      const combined = new Uint8Array(existing.value.length + bytes.length);
      combined.set(existing.value, 0);
      combined.set(bytes, existing.value.length);
      return fs.writeFile(path, combined, context);
    },

    createFile(path, options, context) {
      const resolved = resolve(path, context);
      if (!resolved.ok) return resolved;
      const { absolutePath: abs, inodeId: existingId, parentId, basename } = resolved.value;
      if (existingId !== null && !options.overwrite) {
        return err(fsError('fs/exists', `File already exists: ${abs}`, { path: abs }));
      }
      if (parentId === null) {
        return err(fsError('fs/invalid-path', `Cannot create ${abs}`, { path: abs }));
      }
      const parent = inodes.get(parentId);
      if (!parent || !isDirectory(parent)) {
        return err(fsError('fs/not-a-directory', `Not a directory: ${abs}`, { path: abs }));
      }
      if (!canWrite(parent, context.user)) {
        return err(fsError('fs/permission-denied', `Permission denied: ${abs}`, { path: abs }));
      }
      const id = makeFile(basename, parentId, options.content ?? new Uint8Array(0));
      parent.children.set(basename, id);
      parent.modifiedAtTick = now();
      publish(events.fileCreatedEvent(now(), abs, id));
      return ok(id);
    },

    createDirectory(path, options, context) {
      const canonical = canonicalize(path, context.cwd, home);
      if (!canonical.ok) return canonical;
      const abs = canonical.value;
      const segments = segmentsOf(abs);
      if (segments.length === 0) {
        return err(fsError('fs/exists', 'Cannot create root directory.', { path: abs }));
      }

      let currentId = rootId;
      let currentPath = ROOT_PATH;
      for (let i = 0; i < segments.length; i += 1) {
        const dir = inodes.get(currentId);
        if (!dir || !isDirectory(dir)) {
          return err(
            fsError('fs/not-a-directory', `Not a directory: ${currentPath}`, { path: abs }),
          );
        }
        const name = segments[i] as string;
        const isLast = i === segments.length - 1;
        const existing = dir.children.get(name);
        const childPath = joinPath(currentPath, name);
        if (existing !== undefined) {
          const ex = inodes.get(existing);
          if (!ex || !isDirectory(ex)) {
            return err(
              fsError('fs/not-a-directory', `Not a directory: ${childPath}`, { path: abs }),
            );
          }
          if (isLast && !options.recursive) {
            return err(fsError('fs/exists', `File already exists: ${abs}`, { path: abs }));
          }
          currentId = existing;
          currentPath = childPath;
          continue;
        }
        if (!isLast && !options.recursive) {
          return err(
            fsError('fs/not-found', `No such directory: ${currentPath}`, {
              path: abs,
              hint: 'Use `mkdir -p` to create parent directories.',
            }),
          );
        }
        if (!canWrite(dir, context.user)) {
          return err(
            fsError('fs/permission-denied', `Permission denied: ${childPath}`, { path: abs }),
          );
        }
        const id = makeDir(name, currentId, defaultDirectoryPermissions());
        dir.children.set(name, id);
        dir.modifiedAtTick = now();
        publish(events.directoryCreatedEvent(now(), childPath, id));
        currentId = id;
        currentPath = childPath;
      }
      return ok(currentId);
    },

    remove(path, options, context) {
      const resolved = resolve(path, context);
      if (!resolved.ok) return resolved;
      const { absolutePath: abs, inodeId: id, parentId, basename } = resolved.value;
      if (id === null) {
        if (options.force) return ok(undefined);
        return notFound(abs);
      }
      const inode = inodes.get(id);
      if (!inode || parentId === null) return notFound(abs);
      const parent = inodes.get(parentId);
      if (!parent || !isDirectory(parent)) return notFound(abs);
      if (!canWrite(parent, context.user)) {
        return err(fsError('fs/permission-denied', `Permission denied: ${abs}`, { path: abs }));
      }
      if (isDirectory(inode) && inode.children.size > 0 && !options.recursive) {
        return err(
          fsError('fs/not-empty', `Cannot remove ${abs} because it is a non-empty directory.`, {
            path: abs,
            hint: `Use \`rm -r ${abs}\` to remove recursively.`,
          }),
        );
      }
      const isDir = isDirectory(inode);
      removeInode(id);
      parent.children.delete(basename);
      parent.modifiedAtTick = now();
      publish(
        isDir ? events.directoryDeletedEvent(now(), abs) : events.fileDeletedEvent(now(), abs),
      );
      return ok(undefined);
    },

    move(from, to, context) {
      const src = resolve(from, context);
      if (!src.ok) return src;
      if (src.value.inodeId === null || src.value.parentId === null) {
        return notFound(src.value.absolutePath);
      }
      const dst = resolve(to, context);
      if (!dst.ok) return dst;
      if (dst.value.inodeId !== null) {
        return err(
          fsError('fs/exists', `Destination already exists: ${dst.value.absolutePath}`, {
            path: dst.value.absolutePath,
          }),
        );
      }
      if (dst.value.parentId === null) {
        return err(fsError('fs/invalid-path', `Cannot move to ${dst.value.absolutePath}`));
      }
      // Prevent moving a directory into its own descendant.
      if (isDescendant(src.value.inodeId, dst.value.parentId)) {
        return err(
          fsError('fs/invalid-move', 'Cannot move a directory into its own descendant.', {
            path: dst.value.absolutePath,
          }),
        );
      }
      const inode = inodes.get(src.value.inodeId);
      const oldParent = inodes.get(src.value.parentId);
      const newParent = inodes.get(dst.value.parentId);
      if (
        !inode ||
        !oldParent ||
        !isDirectory(oldParent) ||
        !newParent ||
        !isDirectory(newParent)
      ) {
        return notFound(src.value.absolutePath);
      }
      oldParent.children.delete(src.value.basename);
      inode.name = dst.value.basename;
      inode.parentId = newParent.id;
      newParent.children.set(dst.value.basename, inode.id);
      oldParent.modifiedAtTick = now();
      newParent.modifiedAtTick = now();
      publish(events.movedEvent(now(), src.value.absolutePath, dst.value.absolutePath));
      return ok(undefined);
    },

    copy(from, to, context) {
      const src = resolve(from, context);
      if (!src.ok) return src;
      if (src.value.inodeId === null) return notFound(src.value.absolutePath);
      const inode = inodes.get(src.value.inodeId);
      if (!inode) return notFound(src.value.absolutePath);
      if (isDirectory(inode)) {
        return err(
          fsError('fs/is-a-directory', 'Recursive directory copy is not supported yet.', {
            path: src.value.absolutePath,
          }),
        );
      }
      if (!isFile(inode)) {
        return err(
          fsError('fs/not-a-file', `Not a file: ${src.value.absolutePath}`, {
            path: src.value.absolutePath,
          }),
        );
      }
      const content = contentStore.read(inode.contentRef);
      if (!content.ok) return content;
      const created = fs.createFile(to, { content: content.value }, context);
      if (!created.ok) return created;
      const dstResolved = resolve(to, context);
      if (dstResolved.ok) {
        publish(events.copiedEvent(now(), src.value.absolutePath, dstResolved.value.absolutePath));
      }
      return created;
    },

    snapshot() {
      const serialized: SerializedInode[] = [];
      for (const id of [...inodes.keys()].sort((a, b) => a - b)) {
        const inode = inodes.get(id) as Inode;
        const base: SerializedInode = {
          id: inode.id,
          kind: inode.kind,
          name: inode.name,
          parentId: inode.parentId,
          owner: inode.owner,
          group: inode.group,
          permissions: inode.permissions,
          createdAtTick: inode.createdAtTick,
          modifiedAtTick: inode.modifiedAtTick,
          accessedAtTick: inode.accessedAtTick,
          sizeBytes: inode.sizeBytes,
        };
        if (isFile(inode)) {
          base.contentRef = inode.contentRef;
          base.mimeType = inode.mimeType;
          base.encoding = inode.encoding;
        } else if (isDirectory(inode)) {
          const children: Record<string, number> = {};
          for (const key of [...inode.children.keys()].sort()) {
            children[key] = inode.children.get(key) as number;
          }
          base.children = children;
        }
        serialized.push(base);
      }
      return {
        version: SNAPSHOT_VERSION,
        rootInodeId: rootId,
        nextInodeId: nextId,
        inodes: serialized,
        contentStore: contentStore.snapshot(),
      };
    },

    restore(snapshot) {
      if (snapshot.version !== SNAPSHOT_VERSION) {
        return err(
          fsError(
            'fs/snapshot-version',
            `Snapshot version ${snapshot.version} is not supported (expected ${SNAPSHOT_VERSION}).`,
          ),
        );
      }
      const rebuilt = new Map<InodeId, Inode>();
      for (const s of snapshot.inodes) {
        const id = inodeId(s.id);
        if (s.kind === 'directory') {
          const children = new Map<string, InodeId>();
          for (const [name, childId] of Object.entries(s.children ?? {})) {
            children.set(name, inodeId(childId));
          }
          rebuilt.set(id, {
            id,
            kind: 'directory',
            name: s.name,
            parentId: s.parentId === null ? null : inodeId(s.parentId),
            owner: userId(s.owner),
            group: groupId(s.group),
            permissions: s.permissions,
            createdAtTick: s.createdAtTick,
            modifiedAtTick: s.modifiedAtTick,
            accessedAtTick: s.accessedAtTick,
            sizeBytes: s.sizeBytes,
            children,
          });
        } else if (s.kind === 'file') {
          rebuilt.set(id, {
            id,
            kind: 'file',
            name: s.name,
            parentId: s.parentId === null ? null : inodeId(s.parentId),
            owner: userId(s.owner),
            group: groupId(s.group),
            permissions: s.permissions,
            createdAtTick: s.createdAtTick,
            modifiedAtTick: s.modifiedAtTick,
            accessedAtTick: s.accessedAtTick,
            sizeBytes: s.sizeBytes,
            contentRef: contentRef(s.contentRef ?? ''),
            mimeType: s.mimeType ?? 'text/plain',
            encoding: s.encoding ?? 'utf-8',
          });
        }
      }
      inodes = rebuilt;
      rootId = inodeId(snapshot.rootInodeId);
      nextId = snapshot.nextInodeId;
      contentStore.restore(snapshot.contentStore);
      return ok(undefined);
    },
  };

  function removeInode(id: InodeId): void {
    const inode = inodes.get(id);
    if (!inode) return;
    if (isDirectory(inode)) {
      for (const childId of inode.children.values()) removeInode(childId);
    } else if (isFile(inode)) {
      contentStore.delete(inode.contentRef);
    }
    inodes.delete(id);
  }

  function isDescendant(ancestorId: InodeId, candidateId: InodeId): boolean {
    let current: InodeId | null = candidateId;
    while (current !== null) {
      if (current === ancestorId) return true;
      const inode = inodes.get(current);
      current = inode ? inode.parentId : null;
    }
    return false;
  }

  // ---- Seed the default tree (no events; this is boot-time state) -------------
  rootId = makeDir('/', null, defaultDirectoryPermissions());
  const homeId = makeDir('home', rootId, defaultDirectoryPermissions());
  (inodes.get(rootId) as DirectoryInode).children.set('home', homeId);
  const studentId = makeDir('student', homeId, defaultDirectoryPermissions());
  (inodes.get(homeId) as DirectoryInode).children.set('student', studentId);
  const studentDir = inodes.get(studentId) as DirectoryInode;
  const readme = makeFile('README.txt', studentId, encoder.encode('Welcome to NovaOS.\n'));
  studentDir.children.set('README.txt', readme);
  const mainAsm = makeFile('main.asm', studentId, encoder.encode('MOV R0, 5\nSYSCALL 0\nHALT\n'));
  studentDir.children.set('main.asm', mainAsm);
  const helloC = makeFile(
    'hello.c',
    studentId,
    encoder.encode(
      'int main() {\n  int a = 5;\n  int b = 10;\n  int c = a + b;\n  print(c);\n  return 0;\n}\n',
    ),
  );
  studentDir.children.set('hello.c', helloC);

  const root = inodes.get(rootId) as DirectoryInode;
  const binId = makeDir('bin', rootId, readOnlyDirectoryPermissions());
  root.children.set('bin', binId);
  const tmpId = makeDir('tmp', rootId, defaultDirectoryPermissions());
  root.children.set('tmp', tmpId);
  const usrId = makeDir('usr', rootId, readOnlyDirectoryPermissions());
  root.children.set('usr', usrId);
  const examplesId = makeDir('examples', usrId, readOnlyDirectoryPermissions());
  (inodes.get(usrId) as DirectoryInode).children.set('examples', examplesId);

  return fs;
}

/** Build a user-mode filesystem context. */
export function fsContext(cwd: AbsolutePath, user: UserId = DEFAULT_USER): FsContext {
  return { user, cwd, mode: 'user' };
}
