/**
 * Chaos Engineering — Engine Types
 *
 * Shared type definitions for the chaos experiment engine: fault descriptors,
 * blast-radius scoping, steady-state hypotheses, abort conditions, and the
 * experiment lifecycle state machine.
 *
 * @module ChaosEngineering/Engine
 */

/** Injectable clock — returns epoch milliseconds. Enables deterministic tests. */
export type ChaosClock = () => number;

/** Deterministic random source in [0, 1). Injectable for reproducible experiments. */
export type ChaosRandomSource = () => number;

/**
 * Supported fault categories. `packet-loss` models dropped/dropped-and-duplicated
 * messages at the transport boundary; `resource` models CPU/memory pressure via
 * a burn-loop or allocation churn hook.
 */
export enum FaultKind {
  LATENCY = 'latency',
  ERROR = 'error',
  PACKET_LOSS = 'packet-loss',
  RESOURCE = 'resource',
  ABORT = 'abort',
}

/**
 * Fault severity — drives default probability ceilings for safe experiments.
 */
export enum FaultSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * A predicate deciding whether a given request/target is in the blast radius.
 */
export interface BlastRadiusScope {
  /** Fraction of eligible requests affected, in (0, 1]. */
  readonly percentage: number;
  /** Optional explicit target identifiers; when present, only matching targets are affected. */
  readonly targetIds?: ReadonlySet<string>;
  /** Optional predicate over arbitrary request attributes. */
  readonly targetFilter?: (attributes: Readonly<Record<string, unknown>>) => boolean;
  /** Hard cap on concurrently-affected targets (defense in depth). */
  readonly maxAffectedTargets?: number;
}

/**
 * Parameters describing a single fault instance.
 */
export interface FaultDescriptor {
  readonly id: string;
  readonly kind: FaultKind;
  readonly severity: FaultSeverity;
  /** Probability the fault fires for an in-scope request, in [0, 1]. */
  readonly probability: number;
  /** Latency fault: milliseconds added, or [min, max] for uniform jitter. */
  readonly latencyMs?: number | readonly [number, number];
  /** Error fault: error code / message to synthesize. */
  readonly errorCode?: string;
  readonly errorMessage?: string;
  /** Packet-loss fault: drop probability and optional duplication probability. */
  readonly dropRate?: number;
  readonly duplicateRate?: number;
  /** Resource fault: busy-burn duration in ms and allocation bytes to churn. */
  readonly burnMs?: number;
  readonly churnBytes?: number;
  /** Abort fault: immediately aborts the experiment when it fires. */
  readonly abortReason?: string;
}

/** A request/target flowing through the injection boundary. */
export interface InjectionTarget {
  readonly targetId: string;
  readonly attributes: Readonly<Record<string, unknown>>;
}

/** Outcome of a single fault decision for observability and post-hoc analysis. */
export interface FaultDecision {
  readonly faultId: string;
  readonly kind: FaultKind;
  readonly fired: boolean;
  readonly inScope: boolean;
  readonly targetId: string;
  readonly latencyAddedMs: number;
  readonly detail: string;
  readonly decidedAt: number;
}

/**
 * Statistical comparator used by steady-state probes and abort monitors.
 */
export enum ToleranceKind {
  /** value <= threshold */
  AT_MOST = 'at-most',
  /** value >= threshold */
  AT_LEAST = 'at-least',
  /** |value - baseline| <= absoluteDelta */
  WITHIN_ABSOLUTE = 'within-absolute',
  /** value within [baseline * (1 - pct), baseline * (1 + pct)] */
  WITHIN_PERCENT = 'within-percent',
  /** value inside closed interval [min, max] */
  IN_RANGE = 'in-range',
}

export interface Tolerance {
  readonly kind: ToleranceKind;
  readonly threshold?: number;
  readonly absoluteDelta?: number;
  readonly percent?: number;
  readonly min?: number;
  readonly max?: number;
}

/**
 * A probe that samples a metric and evaluates it against a tolerance.
 */
export interface SteadyStateProbe {
  readonly name: string;
  readonly description: string;
  /** Synchronous or asynchronous sampler producing a numeric measurement. */
  readonly sample: () => number | Promise<number>;
  readonly tolerance: Tolerance;
  /** Minimum samples required before the verdict is meaningful. */
  readonly minSamples: number;
}

export interface ProbeSample {
  readonly probeName: string;
  readonly value: number;
  readonly at: number;
}

export interface ProbeVerdict {
  readonly probeName: string;
  readonly passed: boolean;
  readonly samples: number;
  readonly observedValue: number;
  readonly reason: string;
}

/**
 * An abort ("big red button") condition evaluated continuously during an
 * experiment. When `evaluate` returns true the experiment must terminate and
 * roll back all injected faults.
 */
export interface AbortCondition {
  readonly name: string;
  readonly description: string;
  /** Metric identifier this condition watches (e.g. 'error-rate', 'p99-latency'). */
  readonly metric: string;
  /** Threshold value; comparison direction given by `comparator`. */
  readonly threshold: number;
  readonly comparator: '>' | '>=' | '<' | '<=';
  /** Rolling evaluation window in ms — condition only fires if breached within window. */
  readonly windowMs: number;
  /** Minimum breach ratio inside the window to trigger (default 1.0 = every sample breaches). */
  readonly breachRatio?: number;
}

/** Experiment lifecycle states. */
export enum ExperimentState {
  DEFINED = 'DEFINED',
  VALIDATING = 'VALIDATING',
  BASELINE = 'BASELINE',
  RUNNING = 'RUNNING',
  ANALYZING = 'ANALYZING',
  COMPLETED = 'COMPLETED',
  ABORTED = 'ABORTED',
  FAILED = 'FAILED',
}

/** Legal transitions for the experiment state machine. */
export const EXPERIMENT_TRANSITIONS: Readonly<Record<ExperimentState, ReadonlyArray<ExperimentState>>> = {
  [ExperimentState.DEFINED]: [ExperimentState.VALIDATING, ExperimentState.ABORTED],
  [ExperimentState.VALIDATING]: [ExperimentState.BASELINE, ExperimentState.FAILED, ExperimentState.ABORTED],
  [ExperimentState.BASELINE]: [ExperimentState.RUNNING, ExperimentState.FAILED, ExperimentState.ABORTED],
  [ExperimentState.RUNNING]: [ExperimentState.ANALYZING, ExperimentState.ABORTED, ExperimentState.FAILED],
  [ExperimentState.ANALYZING]: [ExperimentState.COMPLETED, ExperimentState.FAILED, ExperimentState.ABORTED],
  [ExperimentState.COMPLETED]: [],
  [ExperimentState.ABORTED]: [],
  [ExperimentState.FAILED]: [],
};

/** Terminal states — no further transitions permitted. */
export const TERMINAL_EXPERIMENT_STATES: ReadonlySet<ExperimentState> = new Set([
  ExperimentState.COMPLETED,
  ExperimentState.ABORTED,
  ExperimentState.FAILED,
]);

/** A scheduled time window during which experiments are permitted to run. */
export interface SafetyWindow {
  readonly name: string;
  /** Inclusive window start (epoch ms). */
  readonly startsAt: number;
  /** Exclusive window end (epoch ms). */
  readonly endsAt: number;
  /** When true, experiments are FORBIDDEN inside the window (blackout). */
  readonly blackout: boolean;
}

/** Definition of a chaos experiment. */
export interface ChaosExperimentDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly faults: ReadonlyArray<FaultDescriptor>;
  readonly scope: BlastRadiusScope;
  readonly hypothesis: SteadyStateProbe[];
  readonly abortConditions: AbortCondition[];
  /** How long faults stay injected before auto-analysis begins (ms). */
  readonly durationMs: number;
  /** Optional steady-state settle period before baseline sampling (ms). */
  readonly warmupMs?: number;
  /** Minimum confidence (0..1) required for the hypothesis to pass analysis. */
  readonly minConfidence?: number;
}

/** A recorded state transition for auditability. */
export interface ExperimentTransition {
  readonly from: ExperimentState;
  readonly to: ExperimentState;
  readonly at: number;
  readonly reason: string;
}

/** Final experiment report. */
export interface ExperimentReport {
  readonly experimentId: string;
  readonly finalState: ExperimentState;
  readonly transitions: ReadonlyArray<ExperimentTransition>;
  readonly decisions: ReadonlyArray<FaultDecision>;
  readonly verdicts: ReadonlyArray<ProbeVerdict>;
  readonly abortTriggeredBy?: string;
  readonly hypothesisHeld: boolean;
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly durationMs: number;
}
