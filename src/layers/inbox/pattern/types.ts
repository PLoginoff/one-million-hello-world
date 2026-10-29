/**
 * Inbox Pattern Types
 *
 * Types for the idempotent-consumer inbox: record state machine,
 * dedup, in-flight locking, retry/backoff, poison parking,
 * retention, and ordered (per-sequence) delivery.
 *
 * @module Inbox/Pattern
 */

/** Inbox record lifecycle states. */
export enum InboxState {
  /** Persisted, awaiting processing. */
  RECEIVED = 'RECEIVED',
  /** In-flight lock held; handler running. */
  PROCESSING = 'PROCESSING',
  /** Handler completed successfully. Terminal. */
  PROCESSED = 'PROCESSED',
  /** Handler failed; eligible for retry until attempt cap. */
  FAILED = 'FAILED',
  /** Max attempts exhausted — parked (dead-lettered) for inspection. */
  PARKED = 'PARKED',
  /** Buffered behind an unprocessed predecessor (ordered mode). */
  DEFERRED = 'DEFERRED',
}

/** A stored inbox record. */
export interface InboxRecord {
  /** Internal record id. */
  id: string;
  /** Consumer group that owns this record. */
  consumer: string;
  /** Producer-supplied dedup key — unique per consumer. */
  messageId: string;
  /** Payload as delivered (JSON-safe). */
  payload: unknown;
  /** Optional sequence for ordered consumption. */
  sequence?: number;
  state: InboxState;
  /** Processing attempts so far. */
  attempts: number;
  /** Last handler error message. */
  lastError?: string;
  receivedAt: number;
  /** Scheduled next-attempt time for FAILED records. */
  nextAttemptAt?: number;
  processedAt?: number;
  /** If PROCESSING, epoch ms when the lease expires. */
  leaseUntil?: number;
  /** If PARKED, the error that exhausted retries. */
  parkedReason?: string;
}

/** Result of `receive` — dedup classification. */
export interface ReceiveResult {
  record: InboxRecord;
  /** True if the messageId was already recorded. */
  duplicate: boolean;
}

/** How a `processNext` call ended. */
export enum ProcessOutcome {
  PROCESSED = 'processed',
  RETRY_SCHEDULED = 'retry_scheduled',
  PARKED = 'parked',
  DUPLICATE = 'duplicate',
  NOTHING_PENDING = 'nothing_pending',
  DEFERRED_ORDERING = 'deferred_ordering',
  LOCK_BUSY = 'lock_busy',
}

/** Message handler invoked by the engine. */
export type MessageHandler = (payload: unknown, record: InboxRecord) => Promise<void> | void;

/** Retry/backoff configuration. */
export interface InboxRetryConfig {
  /** Max delivery attempts before parking. */
  maxAttempts: number;
  /** Backoff base ms: delay = base * factor^(attempt-1), capped. */
  backoffBaseMs: number;
  backoffFactor: number;
  backoffCapMs: number;
  /** Fraction (0..1) of jitter applied to each delay. */
  jitterFraction: number;
}

export const DEFAULT_RETRY: InboxRetryConfig = {
  maxAttempts: 5,
  backoffBaseMs: 100,
  backoffFactor: 2,
  backoffCapMs: 30_000,
  jitterFraction: 0.2,
};

/** Engine configuration. */
export interface InboxEngineConfig {
  retry: InboxRetryConfig;
  /** Processing lease ms — a crashed consumer's lock expires. */
  leaseMs: number;
  /** Retention: drop PROCESSED records older than this (ms); 0 = keep. */
  retentionMs: number;
  /** Ordered mode: buffer messages until their predecessor is processed. */
  ordered: boolean;
  /** Sequence gap tolerance: skip a missing predecessor after this many
   *  DEFERRED records pile up behind it; 0 = wait forever. */
  maxSequenceGapWait: number;
}

export const DEFAULT_INBOX_CONFIG: InboxEngineConfig = {
  retry: DEFAULT_RETRY,
  leaseMs: 30_000,
  retentionMs: 24 * 60 * 60 * 1000,
  ordered: false,
  maxSequenceGapWait: 0,
};

/** Per-consumer stats. */
export interface ConsumerStats {
  received: number;
  processed: number;
  failedAttempts: number;
  duplicates: number;
  parked: number;
  deferred: number;
  /** Currently PROCESSING. */
  inFlight: number;
  /** Live records held. */
  pending: number;
}

/** Error codes. */
export enum InboxPatternErrorCode {
  RECORD_NOT_FOUND = 'RECORD_NOT_FOUND',
  ILLEGAL_TRANSITION = 'ILLEGAL_TRANSITION',
  LOCK_HELD = 'LOCK_HELD',
  INVALID_MESSAGE = 'INVALID_MESSAGE',
}

export class InboxPatternError extends Error {
  readonly code: InboxPatternErrorCode;
  constructor(code: InboxPatternErrorCode, message: string) {
    super(message);
    this.name = 'InboxPatternError';
    this.code = code;
  }
}
