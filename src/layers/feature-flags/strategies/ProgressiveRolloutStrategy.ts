/**
 * Progressive rollout strategy — time-phased percentage ramp with sticky
 * bucketing.
 *
 * Wraps {@link FlagEvaluator} with a schedule: a flag's rollout percentage
 * ramps through ordered stages over time (e.g. 5% → 25% → 50% → 100%),
 * each stage defined by `{ atMs, percentage }`. Between stages the
 * percentage linearly interpolates or holds — configurable per schedule.
 *
 * Because buckets are sticky and monotonically increasing a percentage
 * only *adds* users (bucket < pct ⇒ in), ramping never ejects a user who
 * was previously included — the standard monotonic-rollout guarantee.
 *
 * Also provides {@link SegmentTargetingStrategy} — a higher-level
 * evaluation strategy that resolves named segments to context predicates
 * ahead of evaluation (precomputing a context → matching-segments index
 * for batch evaluations).
 *
 * @module FeatureFlags/Strategies
 */

import {
  EvalContext,
  EvalReason,
  Evaluation,
  FeatureFlag,
  bucketFor,
  evalClause,
  flattenContext,
  variantForBucket,
} from '../domain/flag-model';
import { FlagEvaluator, FlagStore } from '../implementations/FlagEvaluator';

/* ------------------------------------------------------------------ */
/* Progressive rollout                                                 */
/* ------------------------------------------------------------------ */

export interface RolloutStage {
  /** Wall-clock ms when this stage activates. */
  readonly atMs: number;
  /** Target percentage 0-100 at this stage. */
  readonly percentage: number;
}

export interface RolloutSchedule {
  /** Ordered stages; evaluated against the injected clock. */
  readonly stages: readonly RolloutStage[];
  /**
   * Between-stage behaviour: `'hold'` keeps the previous stage's
   * percentage until the next activates; `'linear'` interpolates
   * toward the next stage's target between stage boundaries.
   * Default `'hold'`.
   */
  readonly mode?: 'hold' | 'linear';
  /** Bucket salt — decorrelates this schedule's rollout from others. */
  readonly salt?: string;
}

export interface ProgressiveRolloutOptions {
  readonly clock?: () => number;
}

/**
 * Computes the *current* rollout percentage for a schedule at time `nowMs`.
 * Before the first stage → 0; past the last → last stage's percentage.
 */
export function currentPercentage(schedule: RolloutSchedule, nowMs: number): number {
  const stages = schedule.stages;
  if (stages.length === 0) {
    return 0;
  }
  if (nowMs < stages[0].atMs) {
    return 0;
  }
  // Find the active stage: last stage with atMs <= now.
  let active = stages[0];
  let next: RolloutStage | undefined;
  for (let i = 0; i < stages.length; i++) {
    if (stages[i].atMs <= nowMs) {
      active = stages[i];
      next = stages[i + 1];
    } else {
      break;
    }
  }
  if (!next || (schedule.mode ?? 'hold') === 'hold') {
    return clampPct(active.percentage);
  }
  // Linear interpolation between active and next.
  const span = next.atMs - active.atMs;
  if (span <= 0) {
    return clampPct(next.percentage);
  }
  const t = (nowMs - active.atMs) / span;
  const pct = active.percentage + t * (next.percentage - active.percentage);
  return clampPct(pct);
}

function clampPct(p: number): number {
  return Math.max(0, Math.min(100, p));
}

/**
 * Evaluates a single flag under a progressive schedule.
 *
 * The flag must have a `on`/`off` or explicit variants; rollout picks the
 * "in" variant (`inVariant`, default 'on' or first variant) when the
 * user's bucket < current percentage.
 */
export class ProgressiveRolloutStrategy {
  readonly name = 'progressive-rollout';
  private readonly _clock: () => number;

  constructor(
    private readonly _evaluator: FlagEvaluator,
    private readonly _store: FlagStore,
    options: ProgressiveRolloutOptions = {}
  ) {
    this._clock = options.clock ?? Date.now;
  }

  /**
   * Evaluates `flagKey` with an explicit schedule, bypassing the flag's
   * static rules. Returns a standard {@link Evaluation}.
   */
  evaluate(
    flagKey: string,
    schedule: RolloutSchedule,
    context?: EvalContext,
    inVariant = 'on'
  ): Evaluation {
    const flag = this._store.getFlag(flagKey);
    if (!flag) {
      return { flagKey, variant: 'off', value: undefined, reason: 'error' };
    }
    if (flag.killed) {
      return { flagKey, variant: flag.offVariant ?? 'off', value: false, reason: 'killed' };
    }
    if (!flag.enabled) {
      return { flagKey, variant: flag.offVariant ?? 'off', value: false, reason: 'disabled' };
    }
    const flat = flattenContext(context);
    const pct = currentPercentage(schedule, this._clock());
    if (pct <= 0) {
      return {
        flagKey,
        variant: flag.offVariant ?? 'off',
        value: this._valueOf(flag, flag.offVariant ?? 'off'),
        reason: 'fallthrough',
        bucket: 100, // not in rollout
      };
    }
    const bucket = bucketFor(flagKey, flat.kind, flat.key ?? 'anonymous', schedule.salt ?? '');
    if (bucket < pct) {
      const variant = variantForBucket(
        { weights: [{ variant: inVariant, weight: pct }, { variant: flag.offVariant ?? 'off', weight: 100 - pct }], salt: schedule.salt },
        bucket
      ) ?? inVariant;
      return {
        flagKey,
        variant,
        value: this._valueOf(flag, variant),
        reason: 'rule-match',
        bucket,
      };
    }
    return {
      flagKey,
      variant: flag.offVariant ?? 'off',
      value: this._valueOf(flag, flag.offVariant ?? 'off'),
      reason: 'fallthrough',
      bucket,
    };
  }

  /** Convenience — current ramp percentage (for dashboards). */
  percentageFor(schedule: RolloutSchedule): number {
    return currentPercentage(schedule, this._clock());
  }

  private _valueOf(flag: FeatureFlag, variant: string): unknown {
    const v = (flag.variants ?? []).find((x) => x.id === variant);
    if (v) {
      return v.value;
    }
    return flag.type === 'boolean' ? variant === 'on' : undefined;
  }
}

/* ------------------------------------------------------------------ */
/* Segment batch targeting                                             */
/* ------------------------------------------------------------------ */

/**
 * Precomputes which segments a context belongs to, then runs flag
 * evaluation with segment membership pre-resolved — useful when evaluating
 * many flags for one context (the per-flag segment re-check is otherwise
 * O(flags × segments × clauses)).
 */
export class SegmentTargetingStrategy {
  readonly name = 'segment-targeting';

  constructor(
    private readonly _evaluator: FlagEvaluator,
    private readonly _store: FlagStore
  ) {}

  /** Segment ids the context belongs to. */
  matchingSegments(context: EvalContext | undefined): Set<string> {
    const flat = flattenContext(context);
    const out = new Set<string>();
    for (const s of this._store.allSegments()) {
      if (s.clauses.every((c) => evalClause(c, flat.attributes))) {
        out.add(s.id);
      }
    }
    return out;
  }

  /**
   * Evaluates all flags, returning the subset whose outcome is not 'off'.
   * For dashboards / prefetch endpoints ("all flags for user").
   */
  evaluateAll(context?: EvalContext): Map<string, Evaluation> {
    const out = new Map<string, Evaluation>();
    for (const flag of this._store.allFlags()) {
      out.set(flag.key, this._evaluator.evaluate(flag.key, context));
    }
    return out;
  }
}

export type { EvalReason };
