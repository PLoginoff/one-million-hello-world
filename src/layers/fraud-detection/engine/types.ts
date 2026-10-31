/**
 * Fraud-Detection Engine — shared types.
 *
 * Vocabulary:
 * - `VelocityTracker`     — exact sliding-window counters for
 *                            transactions per card/user/device at
 *                            1min/1h/1d scales.
 * - `FraudGraph`          — entity-linkage graph with fraud-ring
 *                            traversal depth scoring.
 * - `CaseManager`         — investigation queue with open →
 *                            investigating → closed lifecycle.
 * - `ModelRegistry`       — A/B model versions with shadow scoring.
 * - `DeviceIntelligence`  — per-device profile: age, trust score,
 *                            associated accounts/IP churn.
 * - `SessionAnalyzer`     — behavioral biometrics: session length,
 *                            navigation-path entropy, action timing.
 * - `CrossChannelLinker`  — same user across web/mobile/… channels
 *                            correlated into shared risk signals.
 * - `AdaptiveThresholds`  — per-merchant risk tolerance that tunes
 *                            flag/block cutoffs from feedback outcomes.
 *
 * @module FraudDetectionLayer/Engine
 */

import { Transaction } from '../implementations/fraud/Types';

/* ------------------------------------------------------------------ */
/* Clock                                                               */
/* ------------------------------------------------------------------ */

export interface FraudClock {
  now(): number;
}

export class SystemFraudClock implements FraudClock {
  now(): number {
    return Date.now();
  }
}

export class ManualFraudClock implements FraudClock {
  private _t = 0;
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

/* ------------------------------------------------------------------ */
/* Velocity                                                            */
/* ------------------------------------------------------------------ */

/** Entity kinds velocity is tracked over. */
export type VelocityDimension = 'card' | 'user' | 'device' | 'ip';

/** Named rolling windows. */
export type VelocityWindow = '1m' | '1h' | '1d';

export interface VelocityFeatures {
  readonly dimension: VelocityDimension;
  readonly key: string;
  readonly count1m: number;
  readonly count1h: number;
  readonly count1d: number;
  readonly sum1m: number;
  readonly sum1h: number;
  readonly sum1d: number;
  /** distinct counterparties (merchants/users) in the 1d window */
  readonly distinct1d: number;
  /** ms since the previous transaction on this key; -1 if none */
  readonly interArrivalMs: number;
}

/* ------------------------------------------------------------------ */
/* Graph                                                               */
/* ------------------------------------------------------------------ */

/** Node kinds in the entity-linkage graph. */
export type GraphNodeKind = 'user' | 'card' | 'device' | 'ip' | 'address';

export interface GraphNode {
  readonly kind: GraphNodeKind;
  readonly id: string;
}

export interface FraudRingResult {
  /** member user ids of the connected component. */
  readonly userIds: readonly string[];
  /** total nodes in the component (users + shared attrs). */
  readonly componentSize: number;
  /** attributes shared by ≥2 users in the component. */
  readonly sharedAttributes: readonly GraphNode[];
  /** 0..1 — scales with ring size and attribute overlap. */
  readonly riskScore: number;
  /** longest shortest-path between two users in the ring. */
  readonly maxDepth: number;
}

/* ------------------------------------------------------------------ */
/* Case management                                                     */
/* ------------------------------------------------------------------ */

export type CaseState = 'open' | 'investigating' | 'closed';
export type CaseResolution = 'fraud' | 'legitimate' | 'inconclusive';

export interface FraudCase {
  readonly id: string;
  readonly transactionId: string;
  readonly userId: string;
  readonly state: CaseState;
  readonly openedAt: number;
  readonly assignee?: string;
  readonly notes: readonly CaseNote[];
  readonly resolution?: CaseResolution;
  readonly closedAt?: number;
}

export interface CaseNote {
  readonly author: string;
  readonly text: string;
  readonly at: number;
}

/* ------------------------------------------------------------------ */
/* Model versioning                                                    */
/* ------------------------------------------------------------------ */

/** Scoring contract a model version implements. */
export interface ScoringModel {
  readonly modelId: string;
  score(tx: Transaction): number;
}

export interface ShadowComparison {
  readonly transactionId: string;
  readonly primaryScore: number;
  readonly shadowScore: number;
  /** |primary − shadow| — disagreement magnitude. */
  readonly divergence: number;
  readonly primaryDecision: 'flag' | 'pass';
  readonly shadowDecision: 'flag' | 'pass';
  /** decisions disagreed */
  readonly disagree: boolean;
}

export interface ShadowStats {
  readonly comparisons: number;
  readonly disagreements: number;
  /** disagreement rate 0..1 */
  readonly disagreementRate: number;
  /** mean absolute score divergence */
  readonly meanDivergence: number;
}

/* ------------------------------------------------------------------ */
/* Device intelligence                                                 */
/* ------------------------------------------------------------------ */

export interface DeviceProfileOptions {
  /**
   * Half-life in ms for trust-score decay toward neutral (0.5).
   * A device that goes quiet drifts back to "unknown". Default 30d.
   */
  readonly trustHalfLifeMs?: number;
  /**
   * Trust deltas applied per observed outcome. Positive signals push
   * the score toward 1 (trusted), fraud signals toward 0.
   */
  readonly cleanSignal?: number;
  readonly fraudSignal?: number;
  /** devices older than this (ms) count as "established". Default 30d. */
  readonly matureAgeMs?: number;
}

export interface DeviceSignal {
  readonly deviceId: string;
  /** device age since first sighting, ms at query time. */
  readonly ageMs: number;
  /** 0..1 — evidence-weighted trust; 0.5 = unknown. */
  readonly trustScore: number;
  /** distinct user ids seen on this device. */
  readonly accountCount: number;
  /** distinct IPs seen on this device. */
  readonly ipCount: number;
  /** distinct devices the same accounts have used (fan-out). */
  readonly sharedDeviceCount: number;
  /** composite 0..1 risk contribution from this device. */
  readonly riskScore: number;
  /** human-readable reasons backing the risk score. */
  readonly reasons: readonly string[];
}

/* ------------------------------------------------------------------ */
/* Session behavior                                                    */
/* ------------------------------------------------------------------ */

export interface SessionAction {
  /** action label, e.g. 'page:home', 'click:checkout', 'keystroke'. */
  readonly kind: string;
  /** epoch millis of the action. */
  readonly at: number;
  /** free-form detail (url, element id) for entropy grouping. */
  readonly target?: string;
}

export interface SessionFeatures {
  readonly sessionId: string;
  readonly userId?: string;
  /** session wall time, ms. */
  readonly durationMs: number;
  /** actions recorded. */
  readonly actionCount: number;
  /** mean ms between consecutive actions. */
  readonly meanGapMs: number;
  /** stddev of inter-action gaps — humans vary, bots don't. */
  readonly gapStddevMs: number;
  /**
   * Shannon entropy (bits) over distinct navigation targets — low
   * entropy = scripted/repetitive pathing.
   */
  readonly pathEntropyBits: number;
  /**
   * distinct-action ratio: unique kinds / total actions. Bots replay
   * the same action; humans browse variably.
   */
  readonly actionDiversity: number;
  /** composite 0..1 bot/fraud-likelihood. */
  readonly botScore: number;
}

export interface SessionAnalyzerOptions {
  /**
   * Regularity threshold: sessions whose gap coefficient of variation
   * (stddev/mean) falls below this look scripted. Default 0.15.
   */
  readonly regularityCv?: number;
  /** sessions under this many actions score 0 (insufficient data). */
  readonly minActions?: number;
  /** expected human path entropy (bits) — calibration anchor. */
  readonly humanEntropyBits?: number;
}

/* ------------------------------------------------------------------ */
/* Cross-channel correlation                                           */
/* ------------------------------------------------------------------ */

export type Channel = 'web' | 'mobile' | 'api' | 'pos' | 'phone';

export interface ChannelObservation {
  readonly userId: string;
  readonly channel: Channel;
  /** device fingerprint as seen on that channel. */
  readonly deviceId?: string;
  readonly ipAddress?: string;
  /** epoch millis. */
  readonly at: number;
  /** anomalous: a risky outcome (chargeback, alert) on this channel. */
  readonly flagged?: boolean;
}

export interface CrossChannelSignal {
  readonly userId: string;
  /** distinct channels the user has appeared on. */
  readonly channels: readonly Channel[];
  /**
   * channel-switch velocity: switches in the trailing hour — account
   * takeover often moves web→mobile within minutes.
   */
  readonly switchesLastHour: number;
  /** devices shared across ≥2 distinct channels (the linking signal). */
  readonly sharedDevices: readonly string[];
  /** flagged observations on any channel (badness propagates). */
  readonly flaggedCount: number;
  /** composite 0..1 — cross-channel inconsistency/risk. */
  readonly riskScore: number;
  readonly reasons: readonly string[];
}

export interface CrossChannelOptions {
  /** ms window for "rapid channel switch" counting. Default 1h. */
  readonly switchWindowMs?: number;
  /** ms window for flag persistence. Default 30d. */
  readonly flagWindowMs?: number;
  /** weight: shared devices are identity-confirming (reduce risk). */
  readonly sharedDeviceBonus?: number;
}

/* ------------------------------------------------------------------ */
/* Adaptive thresholds                                                 */
/* ------------------------------------------------------------------ */

export interface MerchantRiskProfile {
  readonly merchantId: string;
  /** flag threshold: scores ≥ → review. */
  readonly flagThreshold: number;
  /** block threshold: scores ≥ → decline. */
  readonly blockThreshold: number;
  /** observed fraud rate (EWMA) feeding the adaptation. */
  readonly observedFraudRate: number;
  /** decisions this profile has adapted over. */
  readonly decisions: number;
}

export interface AdaptiveThresholdOptions {
  /**
   * Target false-decline budget per merchant: fraction of legitimate
   * volume the merchant tolerates flagging. Default 0.02 (2%).
   */
  readonly targetFalsePositiveRate?: number;
  /**
   * EWMA learning rate for fraud-rate tracking. Default 0.05.
   */
  readonly learningRate?: number;
  /** score range the thresholds live in. Default [0, 100]. */
  readonly scoreMin?: number;
  readonly scoreMax?: number;
  /**
   * Step the thresholds move per correction, relative to score range.
   * Default 0.01 (1% of range per outcome).
   */
  readonly step?: number;
}

export type ThresholdOutcome = 'fraud-confirmed' | 'false-alarm' | 'clean';

export interface ThresholdDecision {
  readonly merchantId: string;
  readonly score: number;
  readonly decision: 'approve' | 'review' | 'decline';
  readonly flagThreshold: number;
  readonly blockThreshold: number;
  /** false-alarm budget pressure 0..1 driving adaptation. */
  readonly fpPressure: number;
}
