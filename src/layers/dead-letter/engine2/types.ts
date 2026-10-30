/**
 * DeadLetter Engine2 — Shared Types
 *
 * Second-generation dead-letter tooling: DLQ analytics (top failure
 * reasons, error clustering by normalised signature), scheduled replay
 * (bounded N-per-interval pacing), poison-message quarantine (permanent
 * parking pending manual review), queue-size threshold alerts, and
 * cross-DLQ transfers.
 *
 * The record store is in-memory and deliberately transport-agnostic: an
 * `Engine2Record` is the smallest shape every feature needs. Time is
 * injected for scheduling, ageing and rate metrics.
 *
 * @module DeadLetterLayer/Engine2
 */

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------

export interface DlqClock2 {
  now(): number;
}

export class SystemDlqClock2 implements DlqClock2 {
  now(): number {
    return Date.now();
  }
}

export class ManualDlqClock2 implements DlqClock2 {
  private _t: number;
  constructor(start: number = 0) {
    this._t = start;
  }
  now(): number {
    return this._t;
  }
  advance(ms: number): void {
    this._t += ms;
  }
  set(ms: number): void {
    this._t = ms;
  }
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

/**
 * A dead-lettered work item. `signature` is assigned by the analytics
 * clusterer (see ErrorClusters); a record carries the raw material the
 * signature derives from — the error's class, message and first frame —
 * never the payload body (payloads may hold PII and belong to the
 * owning queue, not to analytics).
 */
export interface Engine2Record {
  readonly id: string;
  /** Queue the record currently sits in. */
  readonly queue: string;
  /** Logical source queue it failed from (routing provenance). */
  readonly origin: string;
  readonly enqueuedAt: number;
  readonly failedAt: number;
  readonly attempts: number;
  readonly errorClass: string;
  readonly errorMessage: string;
  /** Top stack frame `file:line`, when the producer captured it. */
  readonly errorSite?: string;
  /** Arbitrary routing/copyable fields for replay redelivery. */
  readonly headers: Readonly<Record<string, string>>;
  readonly payload: unknown;
}

export type RecordState = 'pending' | 'replaying' | 'replayed' | 'quarantined' | 'transferred';

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

/** One failure-reason bucket in the top-N report. */
export interface ReasonCount {
  /** The reason key: errorClass for `class`, full signature for `signature`. */
  readonly key: string;
  readonly count: number;
  /** Share of the analysed set (0..1). */
  readonly share: number;
  /** Most recent `failedAt` inside the bucket. */
  readonly lastSeenAt: number;
}

export interface ReasonReport {
  readonly queue: string;
  readonly analysed: number;
  readonly top: readonly ReasonCount[];
  /** Records that did not fit the top-N cut. */
  readonly remainder: number;
}

// ---------------------------------------------------------------------------
// Replay scheduling
// ---------------------------------------------------------------------------

export interface ReplayPlan {
  /** Max records moved per interval tick. */
  readonly perInterval: number;
  /** Interval length in ms. */
  readonly intervalMs: number;
  /** Optional cap on total records this plan will move. */
  readonly maxTotal?: number;
  /** Only records older than this many ms are eligible. */
  readonly minAgeMs?: number;
}

export interface ReplayTick {
  readonly at: number;
  readonly moved: readonly string[];
  /** Records left pending after this tick. */
  readonly remaining: number;
}

// ---------------------------------------------------------------------------
// Quarantine
// ---------------------------------------------------------------------------

export interface QuarantineEntry {
  readonly recordId: string;
  readonly quarantinedAt: number;
  readonly signature: string;
  /** Human-supplied reason at quarantine time. */
  readonly note?: string;
  /** Review outcome while parked. */
  readonly review?: {
    readonly at: number;
    readonly reviewer: string;
    readonly verdict: 'release' | 'keep' | 'purge';
    readonly comment?: string;
  };
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export interface SizeThreshold {
  /** Fire when pending depth reaches this count. */
  readonly depth: number;
  /** Severity label carried into the hook payload. */
  readonly severity: string;
}

export interface SizeAlert {
  readonly queue: string;
  readonly depth: number;
  readonly threshold: SizeThreshold;
  /** True when this is the first crossing; false for repeated stays. */
  readonly entered: boolean;
  readonly at: number;
}

export type SizeAlertHook = (alert: SizeAlert) => void;

// ---------------------------------------------------------------------------
// Transfers
// ---------------------------------------------------------------------------

export interface TransferResult {
  readonly recordId: string;
  readonly from: string;
  readonly to: string;
  /** New record id in the destination queue (ids are queue-scoped). */
  readonly newId: string;
  readonly transferredAt: number;
}
