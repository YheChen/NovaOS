import type { Brand, Result } from '@novaos/shared';
import { ok, err, novaError } from '@novaos/shared';

/** Virtual page number (index into a process page table). */
export type Vpn = Brand<number, 'Vpn'>;
/** Physical frame number (index into the physical frame table). */
export type Pfn = Brand<number, 'Pfn'>;
/** A virtual address within one process's address space. */
export type VirtualAddress = Brand<number, 'VirtualAddress'>;
/** A physical address (frame base + offset). */
export type PhysicalAddress = Brand<number, 'PhysicalAddress'>;

export const asVpn = (n: number): Vpn => n as Vpn;
export const asPfn = (n: number): Pfn => n as Pfn;
export const asVirtualAddress = (n: number): VirtualAddress => n as VirtualAddress;
export const asPhysicalAddress = (n: number): PhysicalAddress => n as PhysicalAddress;

/**
 * Addressing model. `pageSizeBytes` must be a power of two; the offset width is
 * `log2(pageSizeBytes)`. `virtualAddressBits`/`physicalAddressBits` bound the
 * two address spaces and are validated on construction.
 */
export interface AddressConfig {
  readonly pageSizeBytes: number;
  readonly virtualAddressBits: number;
  readonly physicalAddressBits: number;
}

export interface DecodedVirtualAddress {
  readonly vpn: Vpn;
  readonly offset: number;
}

/** Immutable derived geometry; created once, reused everywhere. */
export interface AddressGeometry {
  readonly config: AddressConfig;
  readonly offsetBits: number;
  readonly vpnBits: number;
  readonly pageCount: number;
  readonly frameCount: number;
}

const isPowerOfTwo = (n: number): boolean => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;

export function createAddressGeometry(config: AddressConfig): Result<AddressGeometry> {
  const { pageSizeBytes, virtualAddressBits, physicalAddressBits } = config;
  if (!isPowerOfTwo(pageSizeBytes)) {
    return err(
      novaError({
        code: 'mmu/invalid-config',
        severity: 'recoverable',
        message: `pageSizeBytes must be a power of two (got ${pageSizeBytes}).`,
      }),
    );
  }
  const offsetBits = Math.round(Math.log2(pageSizeBytes));
  if (!Number.isInteger(virtualAddressBits) || offsetBits >= virtualAddressBits) {
    return err(
      novaError({
        code: 'mmu/invalid-config',
        severity: 'recoverable',
        message: `virtualAddressBits (${virtualAddressBits}) must exceed the ${offsetBits}-bit page offset.`,
      }),
    );
  }
  if (!Number.isInteger(physicalAddressBits) || physicalAddressBits < offsetBits) {
    return err(
      novaError({
        code: 'mmu/invalid-config',
        severity: 'recoverable',
        message: `physicalAddressBits (${physicalAddressBits}) must be at least the ${offsetBits}-bit page offset.`,
      }),
    );
  }
  const vpnBits = virtualAddressBits - offsetBits;
  return ok({
    config,
    offsetBits,
    vpnBits,
    pageCount: 2 ** vpnBits,
    frameCount: 2 ** (physicalAddressBits - offsetBits),
  });
}

export function decodeVirtualAddress(
  g: AddressGeometry,
  va: VirtualAddress,
): Result<DecodedVirtualAddress> {
  const value = va as number;
  if (value < 0 || value >= 2 ** g.config.virtualAddressBits) {
    return err(
      novaError({
        code: 'mmu/va-out-of-range',
        severity: 'recoverable',
        message: `Virtual address ${value} is outside the ${g.config.virtualAddressBits}-bit space.`,
      }),
    );
  }
  const offsetMask = g.config.pageSizeBytes - 1;
  return ok({
    vpn: asVpn(Math.floor(value / g.config.pageSizeBytes)),
    offset: value & offsetMask,
  });
}

export function composePhysicalAddress(
  g: AddressGeometry,
  pfn: Pfn,
  offset: number,
): PhysicalAddress {
  return asPhysicalAddress((pfn as number) * g.config.pageSizeBytes + offset);
}
