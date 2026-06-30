import type { EventId, SequenceNumber, SimTime, CorrelationId, CausationId } from '@novaos/shared';

/**
 * The package a domain event originates from. Used for filtering and timeline
 * categorization.
 */
export type EventSource =
  | 'cpu'
  | 'memory'
  | 'kernel'
  | 'scheduler'
  | 'filesystem'
  | 'shell'
  | 'terminal'
  | 'assembler'
  | 'compiler'
  | 'debugger'
  | 'runtime'
  | 'ui'
  | 'error';

/**
 * The canonical NovaOS event. Every meaningful state transition in the
 * simulator is published as a `DomainEvent`. `id` and `sequence` are assigned by
 * the event bus on publish, guaranteeing deterministic, replayable ordering.
 *
 * See ADR-0002 for the reconciliation of the two spec variants of this shape.
 */
export interface DomainEvent<TType extends string = string, TPayload = unknown> {
  readonly id: EventId;
  readonly type: TType;
  readonly sequence: SequenceNumber;
  /** Simulated time at which the event occurred. */
  readonly tick: SimTime;
  readonly source: EventSource;
  readonly correlationId?: CorrelationId;
  readonly causationId?: CausationId;
  readonly payload: TPayload;
}

/** An event as emitted by a producer, before the bus assigns `id` and `sequence`. */
export type EventInput<TType extends string = string, TPayload = unknown> = Omit<
  DomainEvent<TType, TPayload>,
  'id' | 'sequence'
>;

export type EventListener<T extends DomainEvent = DomainEvent> = (event: T) => void;

/** Returns true for events a subscriber wants to receive. */
export type EventMatcher = (event: DomainEvent) => boolean;

export type Unsubscribe = () => void;
