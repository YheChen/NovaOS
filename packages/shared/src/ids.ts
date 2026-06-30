import type { Brand } from './brand';
import type { Result } from './result';
import { ok, err } from './result';
import { novaError } from './errors';

// ---------------------------------------------------------------------------
// Branded numeric machine types
// ---------------------------------------------------------------------------

/** A memory address (non-negative integer). */
export type Address = Brand<number, 'Address'>;
/** A single 8-bit byte (0-255). */
export type Byte = Brand<number, 'Byte'>;
/** A 32-bit machine word (0 .. 2^32 - 1). */
export type Word = Brand<number, 'Word'>;
/** Simulated time, measured in ticks. */
export type SimTime = Brand<number, 'SimTime'>;

// ---------------------------------------------------------------------------
// Branded identifier types
// ---------------------------------------------------------------------------

export type EventId = Brand<string, 'EventId'>;
export type CorrelationId = Brand<string, 'CorrelationId'>;
export type CausationId = Brand<string, 'CausationId'>;
export type ProcessId = Brand<number, 'ProcessId'>;
export type SequenceNumber = Brand<number, 'SequenceNumber'>;

export const BYTE_MAX = 0xff;
export const WORD_MAX = 0xffffffff;

// ---------------------------------------------------------------------------
// Unchecked casts — for internal hot paths where the value is known valid.
// ---------------------------------------------------------------------------

export const asAddress = (n: number): Address => n as Address;
export const asByte = (n: number): Byte => n as Byte;
export const asWord = (n: number): Word => n as Word;
export const asSimTime = (n: number): SimTime => n as SimTime;
export const asSequence = (n: number): SequenceNumber => n as SequenceNumber;
export const processId = (n: number): ProcessId => n as ProcessId;
export const eventId = (id: string): EventId => id as EventId;
export const correlationId = (id: string): CorrelationId => id as CorrelationId;
export const causationId = (id: string): CausationId => id as CausationId;

// ---------------------------------------------------------------------------
// Validating constructors — for untrusted/boundary values.
// ---------------------------------------------------------------------------

export function createByte(n: number): Result<Byte> {
  if (!Number.isInteger(n) || n < 0 || n > BYTE_MAX) {
    return err(
      novaError({
        code: 'shared/invalid-byte',
        severity: 'recoverable',
        message: `Value ${n} is not a valid byte (expected an integer 0-${BYTE_MAX}).`,
      }),
    );
  }
  return ok(n as Byte);
}

export function createWord(n: number): Result<Word> {
  if (!Number.isInteger(n) || n < 0 || n > WORD_MAX) {
    return err(
      novaError({
        code: 'shared/invalid-word',
        severity: 'recoverable',
        message: `Value ${n} is not a valid 32-bit word (expected an integer 0-${WORD_MAX}).`,
      }),
    );
  }
  return ok(n as Word);
}

export function createAddress(n: number): Result<Address> {
  if (!Number.isInteger(n) || n < 0) {
    return err(
      novaError({
        code: 'shared/invalid-address',
        severity: 'recoverable',
        message: `Address ${n} must be a non-negative integer.`,
      }),
    );
  }
  return ok(n as Address);
}
