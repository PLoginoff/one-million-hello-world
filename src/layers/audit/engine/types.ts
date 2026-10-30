/**
 * Audit Engine — Shared Types
 *
 * Type definitions for the tamper-evident audit pipeline: hash-chained
 * event capture, immutable append-only storage, querying, retention
 * tiers with legal hold, anomaly detection and export formats.
 *
 * @module AuditLayer/Engine
 */

/** Severity ordering, lowest to highest. */
export type AuditSeverity = 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical';

export const SEVERITY_ORDER: Record<AuditSeverity, number> = {
  debug: 0,
  info: 1,
  notice: 2,
  warning: 3,
  error: 4,
  critical: 5,
};

/** A caller-supplied audit event before it is sealed into a record. */
export interface AuditEventInput {
  /** Who performed the action (user id, service account, ...). */
  readonly actor: string;
  /** What was done, e.g. `user.login`, `document.delete`. */
  readonly action: string;
  /** Affected resource, e.g. `document:1234`. */
  readonly resource?: string;
  /** Resource kind for grouping queries, e.g. `document`. */
  readonly resourceType?: string;
  /** Outcome of the attempted action. */
  readonly outcome?: 'success' | 'failure' | 'denied';
  readonly severity?: AuditSeverity;
  /** Event occurrence time; defaults to clock.now() on seal. */
  readonly timestamp?: number;
  /** Free-form structured details. */
  readonly details?: Record<string, unknown>;
  /** Source IP / origin. */
  readonly sourceIp?: string;
  /** Correlation id linking related events. */
  readonly correlationId?: string;
  /** Tenant or domain partition. */
  readonly tenant?: string;
}

/**
 * A sealed audit record — immutable after creation.
 *
 * `hash` covers the canonical serialization of the record fields
 * plus `previousHash`, forming a tamper-evident chain:
 *
 *   hash_n = SHA256( canonical(fields_n) || previousHash_{n-1} )
 *
 * Any modification or reordering of records breaks every subsequent
 * hash, which `verify()` detects.
 */
export interface AuditRecord {
  /** Monotonic sequence number assigned by the store (starts at 1). */
  readonly seq: number;
  /** Unique record id. */
  readonly id: string;
  readonly timestamp: number;
  readonly actor: string;
  readonly action: string;
  readonly resource?: string;
  readonly resourceType?: string;
  readonly outcome: 'success' | 'failure' | 'denied';
  readonly severity: AuditSeverity;
  readonly details: Record<string, unknown>;
  readonly sourceIp?: string;
  readonly correlationId?: string;
  readonly tenant?: string;
  /** Hash of the previous record, or the genesis constant. */
  readonly previousHash: string;
  /** This record's chain hash. */
  readonly hash: string;
  /** Retention tier assigned at write time. */
  readonly tier: RetentionTierName;
}

/** Retention tier identifiers. */
export type RetentionTierName = 'hot' | 'warm' | 'cold' | 'frozen';

/** Retention tier definition. */
export interface RetentionTier {
  readonly name: RetentionTierName;
  /** Milliseconds records stay in this tier before promotion. */
  readonly maxAgeMs: number;
  /** Next tier; undefined = keep forever / purged at policy end. */
  readonly next?: RetentionTierName;
}

/** Retention policy: ordered tiers + a final purge age. */
export interface RetentionPolicy {
  readonly tiers: readonly RetentionTier[];
  /** Purge records older than this (ms), unless on legal hold. */
  readonly purgeAfterMs: number;
}

/** Legal hold placed on records matching a filter. */
export interface LegalHold {
  readonly id: string;
  readonly reason: string;
  readonly createdAt: number;
  /** Records matching all non-undefined fields are held. */
  readonly filter: {
    readonly actor?: string;
    readonly resource?: string;
    readonly resourceType?: string;
    readonly tenant?: string;
    readonly fromMs?: number;
    readonly toMs?: number;
  };
}

/** Query parameters for the audit query API. */
export interface AuditQuery {
  readonly actor?: string;
  readonly action?: string;
  readonly actionPrefix?: string;
  readonly resource?: string;
  readonly resourceType?: string;
  readonly tenant?: string;
  readonly correlationId?: string;
  readonly outcome?: 'success' | 'failure' | 'denied';
  readonly severity?: AuditSeverity;
  /** Minimum severity (inclusive). */
  readonly minSeverity?: AuditSeverity;
  readonly fromMs?: number;
  readonly toMs?: number;
  readonly limit?: number;
  readonly offset?: number;
  /** Sort order by sequence. Default ascending. */
  readonly order?: 'asc' | 'desc';
}

export interface AuditQueryResult {
  readonly records: readonly AuditRecord[];
  readonly total: number;
}

/** Result of a chain integrity verification. */
export interface IntegrityReport {
  readonly ok: boolean;
  readonly recordsChecked: number;
  /** First corrupted record seq, if any. */
  readonly firstCorruptSeq?: number;
  readonly expectedTipHash?: string;
  readonly actualTipHash?: string;
  readonly detail?: string;
}

/** Anomaly signal raised by a detector. */
export interface AuditAnomaly {
  readonly kind: 'volume-spike' | 'failure-spike' | 'new-actor' | 'off-hours';
  readonly actor?: string;
  readonly detail: string;
  readonly detectedAt: number;
  readonly observedValue: number;
  readonly baselineValue: number;
}

/** Callback for anomaly notifications. */
export type AnomalyListener = (anomaly: AuditAnomaly) => void;

/** Injectable clock. */
export interface AuditClock {
  now(): number;
}

export class SystemAuditClock implements AuditClock {
  now(): number {
    return Date.now();
  }
}

/** Injectable id generator. */
export interface IdGenerator {
  next(): string;
}
