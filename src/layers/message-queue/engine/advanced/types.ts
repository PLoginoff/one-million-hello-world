/**
 * Advanced Queue Engine — shared types.
 *
 * The broker engine already covers priorities, delay, at-least-once leasing,
 * dead-lettering, and consumer groups. This module adds the operational
 * features a production broker needs:
 *
 *   - Multi-queue transactions (two-phase commit: stage → prepare → commit)
 *   - Message TTL with a timing-wheel expiry (dead-letter on expiry)
 *   - Producer quotas (max in-flight messages per producer)
 *   - Message tracing (correlation/causation through producer→consumer chain)
 *   - Priority preemption (high-priority messages reclaim in-flight budget)
 *
 * @module MessageQueueLayer/Engine/Advanced
 */

import type { EngineMessage } from '../types';

/** A staged send inside a transaction — one operation on one queue. */
export interface StagedSend<T = unknown> {
  readonly queue: string;
  readonly payload: T;
  readonly priority: number;
  readonly delayMs: number;
  readonly headers: Record<string, string>;
  readonly ttlMs?: number;
}

/** Transaction lifecycle states. */
export type TxState = 'open' | 'prepared' | 'committed' | 'aborted';

/** Quota accounting for one producer. */
export interface ProducerQuota {
  readonly producerId: string;
  /** Max messages this producer may have outstanding (ready+inFlight). */
  readonly maxInFlight: number;
  /** Currently outstanding (incremented on enqueue, decremented on ack/DLQ). */
  inFlight: number;
  /** Rejected sends for metrics. */
  rejected: number;
}

/** Trace context stamped on a message at enqueue. */
export interface TraceContext {
  /** Whole request chain shares this. */
  readonly correlationId: string;
  /** Immediate parent message (causation). */
  readonly causationId?: string;
  /** Producer identifier (who sent it). */
  readonly producerId?: string;
  /** Enqueue time from the injectable clock. */
  readonly enqueuedAt: number;
}

/** A span in a message's journey — appended at each hop. */
export interface TraceSpan {
  readonly queue: string;
  readonly action: 'enqueued' | 'dequeued' | 'acked' | 'nacked' | 'expired' | 'preempted';
  readonly at: number;
  readonly detail?: string;
}

/** A message plus its accumulated trace (what the tracer hands consumers). */
export interface TracedMessage<T = unknown> {
  readonly message: EngineMessage<T>;
  readonly trace: readonly TraceSpan[];
  readonly context: TraceContext;
}

/** Result of a quota check. */
export type QuotaDecision =
  | { readonly allowed: true; readonly remaining: number }
  | { readonly allowed: false; readonly reason: string };

/** Thrown when a transactional send references an aborted/committed tx. */
export class TransactionStateError extends Error {
  constructor(
    public readonly txId: string,
    public readonly state: TxState
  ) {
    super(`Transaction "${txId}" is ${state} — operation rejected`);
    this.name = 'TransactionStateError';
  }
}

/** Thrown when a producer exceeds its quota. */
export class QuotaExceededError extends Error {
  constructor(
    public readonly producerId: string,
    public readonly maxInFlight: number
  ) {
    super(`Producer "${producerId}" exceeded quota of ${maxInFlight} in-flight messages`);
    this.name = 'QuotaExceededError';
  }
}

/** Thrown when a prepare-phase precondition fails (tx can't commit). */
export class PrepareFailedError extends Error {
  constructor(
    public readonly txId: string,
    public readonly reason: string
  ) {
    super(`Transaction "${txId}" failed to prepare: ${reason}`);
    this.name = 'PrepareFailedError';
  }
}

export type { EngineMessage };
