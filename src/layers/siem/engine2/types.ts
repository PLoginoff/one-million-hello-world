/**
 * SIEM Engine 2 — shared types
 *
 * `engine/` handles detection-time concerns (normalization, correlation,
 * alert state, anomaly scoring). `engine2/` handles the *context* layer
 * around detections:
 *
 *   ThreatIntelFeed   — IP/domain blocklists with per-indicator expiry
 *   BehaviorAnalytics — per-user baselines + deviation scoring
 *   IncidentTimeline  — group related events into reconstructed timelines
 *   FalsePositiveBank — learn suppression rules from dismissed alerts
 *
 * @module SiemLayer/Engine2
 */

import type { IClock } from '../../observability/engine/signals';
import type { NormalizedEvent } from '../engine/EventNormalizer';
import type { Alert } from '../engine/AlertManager';

export type { IClock, NormalizedEvent, Alert };

// ---------------------------------------------------------------------------
// Threat intelligence
// ---------------------------------------------------------------------------

export type IndicatorType = 'ip' | 'domain' | 'hash' | 'url';

export interface Indicator {
  readonly type: IndicatorType;
  readonly value: string;
  /** Source feed name, for provenance/auditing. */
  readonly feed: string;
  /** Optional confidence 0-100; higher = more trustworthy. */
  readonly confidence?: number;
  /** Absolute expiry (epoch ms). Expired indicators stop matching. */
  readonly expiresAtMs?: number;
  readonly tags?: ReadonlyArray<string>;
}

export interface IndicatorMatch {
  readonly type: IndicatorType;
  readonly value: string;
  readonly feed: string;
  readonly confidence?: number;
  /** Which event field matched ('sourceIp', 'destIp', ...). */
  readonly field: string;
}

export interface FeedStats {
  readonly feed: string;
  readonly indicators: number;
  readonly expiredPendingSweep: number;
  readonly lastRefreshMs?: number;
}

// ---------------------------------------------------------------------------
// User behavior analytics
// ---------------------------------------------------------------------------

/**
 * Per-user baseline learned from history. The UEBA keeps bucketed
 * counts per (action, hour-of-day) so it can answer "is it normal for
 * this user to log in at 3am from a new IP?".
 */
export interface UserBaseline {
  readonly user: string;
  readonly firstSeenMs: number;
  readonly lastSeenMs: number;
  readonly totalEvents: number;
  /** action → count histogram. */
  readonly actions: Readonly<Record<string, number>>;
  /** hour-of-day (0-23) → count. */
  readonly hourHistogram: ReadonlyArray<number>;
  /** distinct source IPs (bounded). */
  readonly knownIps: ReadonlyArray<string>;
}

/** One reason contributing to a deviation score. */
export interface DeviationFactor {
  readonly factor: 'new-ip' | 'unusual-hour' | 'unusual-action' | 'burst' | 'new-user';
  readonly weight: number;
  readonly detail: string;
}

export interface DeviationScore {
  readonly user: string;
  /** 0 (typical) .. 1 (maximally anomalous). */
  readonly score: number;
  readonly factors: ReadonlyArray<DeviationFactor>;
}

// ---------------------------------------------------------------------------
// Incident timeline
// ---------------------------------------------------------------------------

/** A group of related events forming one incident thread. */
export interface Incident {
  readonly id: string;
  readonly anchorEventIds: ReadonlyArray<number>;
  readonly events: ReadonlyArray<NormalizedEvent>;
  readonly startedMs: number;
  readonly endedMs: number;
  /** Shared entities that held the cluster together. */
  readonly pivotEntities: ReadonlyArray<string>;
  readonly severity: string;
}

export interface TimelineLink {
  readonly fromEventId: number;
  readonly toEventId: number;
  readonly reason: 'same-user' | 'same-src-ip' | 'same-dest-ip' | 'same-host' | 'temporal';
}

// ---------------------------------------------------------------------------
// False-positive management
// ---------------------------------------------------------------------------

/**
 * A learned suppression rule, distilled from dismissed alerts.
 * `fields` lists which event fields must match for suppression to apply —
 * the narrower the signature, the more surgically it suppresses.
 */
export interface SuppressionRule {
  readonly id: string;
  readonly alertRuleId: string;
  readonly signature: Record<string, string>;
  readonly createdFromAlertId: string;
  readonly createdBy?: string;
  readonly expiresAtMs?: number;
  /** Running count of suppressed alerts — measures rule value. */
  suppressedCount: number;
}

export interface SuppressionDecision {
  readonly suppressed: boolean;
  readonly ruleId?: string;
  readonly reason?: string;
}
