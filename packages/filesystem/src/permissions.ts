export interface PermissionBits {
  readonly read: boolean;
  readonly write: boolean;
  readonly execute: boolean;
}

export interface FilePermissions {
  readonly owner: PermissionBits;
  readonly group: PermissionBits;
  readonly other: PermissionBits;
}

export function bits(read: boolean, write: boolean, execute: boolean): PermissionBits {
  return { read, write, execute };
}

const RW = bits(true, true, false);
const R = bits(true, false, false);
const RX = bits(true, false, true);
const RWX = bits(true, true, true);

/** Default file permissions: `rw-r--r--`. */
export function defaultFilePermissions(): FilePermissions {
  return { owner: RW, group: R, other: R };
}

/** Default directory permissions: `rwxr-xr-x`. */
export function defaultDirectoryPermissions(): FilePermissions {
  return { owner: RWX, group: RX, other: RX };
}

/** Read-only permissions for system files/dirs: `r-xr-xr-x` / `r--r--r--`. */
export function readOnlyDirectoryPermissions(): FilePermissions {
  return { owner: RX, group: RX, other: RX };
}

function formatBits(b: PermissionBits): string {
  return `${b.read ? 'r' : '-'}${b.write ? 'w' : '-'}${b.execute ? 'x' : '-'}`;
}

/** Render permissions as a Unix-style string, e.g. `rwxr-xr-x`. */
export function formatPermissions(p: FilePermissions): string {
  return `${formatBits(p.owner)}${formatBits(p.group)}${formatBits(p.other)}`;
}
