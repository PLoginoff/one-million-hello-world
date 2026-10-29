/**
 * Canary Deploy — Engine Types
 *
 * Types for progressive delivery: step plans, metric gates, baseline-vs-canary
 * statistical comparison, rollback triggers and traffic mirroring.
 *
 * @module CanaryDeploy/Canary
 */

/** Injectable clock — epoch ms. */
export type CanaryClock = () => number;

/** One step in a canary rollout: the canary serves `weightPercent` of traffic. */
export interface CanaryStep {
  readonly weightPercent: number;
  /** How long the canary soaks at this weight before the gate is evaluated (ms). */
  readonly analysisMs: number;
}

/** Metric identifier the canary is judged on. */
export type CanaryMetricKind = 'error-rate' | 'latency-p50' | 'latency-p99' | 'saturation' | 'custom';

/**
 * One gate in a canary analysis: compare canary metric vs baseline.
 */
export interface MetricGate {
  readonly name: string;
  readonly metric: CanaryMetricKind;
  /** Custom metric name when metric === 'custom'. */
  readonly customName?: string;
  /**
   * Comparison mode:
   * - 'absolute': canary value must be ≤ threshold
   * - 'relative': canary ≤ baseline × (1 + toleranceRatio)
   * - 'statistical': Mann-Whitney/Welch-style check — canary distribution
   *   must not be significantly worse than baseline (uses p-value threshold)
   */
  readonly mode: 'absolute' | 'relative' | 'statistical';
  /** Absolute ceiling for 'absolute' mode. */
  readonly threshold?: number;
  /** Allowed degradation ratio for 'relative' mode (e.g. 0.1 = +10%). */
  readonly toleranceRatio?: number;
  /** Significance level for 'statistical' mode (default 0.05). */
  readonly alpha?: number;
  /** Minimum samples required in each cohort before the gate may pass. */
  readonly minSamples: number;
  /** How many consecutive analysis windows may fail before rollback. */
  readonly allowedFailures?: number;
}

export interface MetricObservation {
  readonly at: number;
  readonly value: number;
}

/** Verdict for one gate evaluation. */
export interface GateVerdict {
  readonly gate: string;
  readonly passed: boolean;
  readonly score: number;
  readonly canaryValue: number;
  readonly baselineValue: number;
  readonly reason: string;
  /** p-value when mode === 'statistical'. */
  readonly pValue?: number;
}

/** Canary rollout lifecycle. */
export enum RolloutState {
  PLANNED = 'PLANNED',
  BASELINING = 'BASELINING',
  STEPPING = 'STEPPING',
  ANALYZING = 'ANALYZING',
  PROMOTED = 'PROMOTED',
  ROLLING_BACK = 'ROLLING_BACK',
  ROLLED_BACK = 'ROLLED_BACK',
  PAUSED = 'PAUSED',
  FAILED = 'FAILED',
}

export const ROLLOUT_TRANSITIONS: Readonly<Record<RolloutState, ReadonlyArray<RolloutState>>> = {
  [RolloutState.PLANNED]: [RolloutState.BASELINING, RolloutState.FAILED],
  [RolloutState.BASELINING]: [RolloutState.STEPPING, RolloutState.FAILED],
  [RolloutState.STEPPING]: [RolloutState.ANALYZING, RolloutState.ROLLING_BACK, RolloutState.PAUSED],
  [RolloutState.ANALYZING]: [RolloutState.STEPPING, RolloutState.PROMOTED, RolloutState.ROLLING_BACK],
  [RolloutState.PAUSED]: [RolloutState.STEPPING, RolloutState.ROLLING_BACK],
  [RolloutState.PROMOTED]: [],
  [RolloutState.ROLLING_BACK]: [RolloutState.ROLLED_BACK, RolloutState.FAILED],
  [RolloutState.ROLLED_BACK]: [],
  [RolloutState.FAILED]: [],
};

export interface RolloutTransition {
  readonly from: RolloutState;
  readonly to: RolloutState;
  readonly at: number;
  readonly reason: string;
}

/** Result of one analysis-window evaluation at a step. */
export interface AnalysisResult {
  readonly stepIndex: number;
  readonly windowStart: number;
  readonly windowEnd: number;
  readonly verdicts: ReadonlyArray<GateVerdict>;
  readonly passed: boolean;
}

/** A mirrored request for shadow testing. */
export interface MirroredRequest {
  readonly requestId: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly mirroredAt: number;
}

/** Result of running a mirrored request against the canary. */
export interface MirrorResult {
  readonly requestId: string;
  readonly canaryLatencyMs: number;
  readonly canaryOk: boolean;
  /** Diff between primary and canary responses (empty when identical). */
  readonly diffKeys: ReadonlyArray<string>;
  readonly error?: string;
}
