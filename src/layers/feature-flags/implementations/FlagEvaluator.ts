/**
 * Flag evaluator — the feature-flag decision engine.
 *
 * Wraps the pure functions in `flag-model` with the operational machinery:
 * flag/segment store, dependency resolution (recursive, cycle-guarded),
 * kill switches, evaluation analytics hooks, and a per-context memo for
 * repeated evaluation inside one request.
 *
 * Evaluation order per flag:
 *  1. `killed` → offVariant (reason `killed`)
 *  2. `enabled === false` → offVariant (`disabled`)
 *  3. `requires` — each dependency evaluated recursively; any unmet →
 *     offVariant (`dependency-unmet`)
 *  4. rules in order — first whose clauses+segments all match decides
 *     (`rule-match` / `segment-match`); rollout → bucketed variant,
 *     `variant` → fixed
 *  5. fallthrough — flag's `defaultVariant` (`fallthrough`), else
 *     offVariant (`default`)
 *
 * @module FeatureFlags/Implementations
 */

import {
  BucketKey,
  EvalContext,
  EvalReason,
  Evaluation,
  FeatureFlag,
  FlagVariant,
  Rollout,
  Segment,
  bucketFor,
  evalClause,
  flattenContext,
  variantForBucket,
} from '../domain/flag-model';

/** Analytics hook — called once per top-level evaluate (not per dependency). */
export interface EvaluationAnalytics {
  onEvaluated(evaluation: Evaluation, context: EvalContext | undefined, durationMs: number): void;
}

export interface FlagStore {
  getFlag(key: string): FeatureFlag | undefined;
  getSegment(id: string): Segment | undefined;
  allFlags(): FeatureFlag[];
  allSegments(): Segment[];
}

export class InMemoryFlagStore implements FlagStore {
  private readonly _flags = new Map<string, FeatureFlag>();
  private readonly _segments = new Map<string, Segment>();

  putFlag(flag: FeatureFlag): void {
    this._flags.set(flag.key, flag);
  }

  removeFlag(key: string): boolean {
    return this._flags.delete(key);
  }

  putSegment(segment: Segment): void {
    this._segments.set(segment.id, segment);
  }

  getFlag(key: string): FeatureFlag | undefined {
    return this._flags.get(key);
  }

  getSegment(id: string): Segment | undefined {
    return this._segments.get(id);
  }

  allFlags(): FeatureFlag[] {
    return Array.from(this._flags.values());
  }

  allSegments(): Segment[] {
    return Array.from(this._segments.values());
  }

  clear(): void {
    this._flags.clear();
    this._segments.clear();
  }
}

export interface FlagEvaluatorOptions {
  readonly clock?: () => number;
  readonly analytics?: EvaluationAnalytics;
  /** Max dependency depth — runaway guard for pathological chains. */
  readonly maxDependencyDepth?: number;
}

/**
 * Counting analytics — a built-in hook that tallies evaluations per flag,
 * variant and reason. Enough for "how often is this flag hit" dashboards.
 */
export class CountingAnalytics implements EvaluationAnalytics {
  private _total = 0;
  private readonly _byFlag = new Map<string, number>();
  private readonly _byVariant = new Map<string, number>();
  private readonly _byReason = new Map<string, number>();
  private readonly _listeners: ((e: Evaluation) => void)[] = [];

  onEvaluated(e: Evaluation): void {
    this._total++;
    this._byFlag.set(e.flagKey, (this._byFlag.get(e.flagKey) ?? 0) + 1);
    this._byVariant.set(`${e.flagKey}:${e.variant}`, (this._byVariant.get(`${e.flagKey}:${e.variant}`) ?? 0) + 1);
    this._byReason.set(`${e.flagKey}:${e.reason}`, (this._byReason.get(`${e.flagKey}:${e.reason}`) ?? 0) + 1);
    for (const l of this._listeners) {
      l(e);
    }
  }

  onEachEvaluation(listener: (e: Evaluation) => void): void {
    this._listeners.push(listener);
  }

  total(): number {
    return this._total;
  }

  forFlag(key: string): number {
    return this._byFlag.get(key) ?? 0;
  }

  forVariant(flagKey: string, variant: string): number {
    return this._byVariant.get(`${flagKey}:${variant}`) ?? 0;
  }

  forReason(flagKey: string, reason: EvalReason): number {
    return this._byReason.get(`${flagKey}:${reason}`) ?? 0;
  }

  reset(): void {
    this._total = 0;
    this._byFlag.clear();
    this._byVariant.clear();
    this._byReason.clear();
  }
}

export class FlagEvaluator {
  private readonly _store: FlagStore;
  private readonly _clock: () => number;
  private readonly _analytics?: EvaluationAnalytics;
  private readonly _maxDepth: number;

  constructor(store: FlagStore, options: FlagEvaluatorOptions = {}) {
    this._store = store;
    this._clock = options.clock ?? Date.now;
    this._analytics = options.analytics;
    this._maxDepth = options.maxDependencyDepth ?? 10;
  }

  /* ------------------------- public API ------------------------- */

  /**
   * Full evaluation — returns the decision record. Prefer the typed
   * conveniences `boolValue`/`variant`/`jsonValue` for call sites.
   */
  evaluate(flagKey: string, context?: EvalContext): Evaluation {
    const started = this._clock();
    const evaluation = this._evaluate(flagKey, context, new Set(), 0);
    this._analytics?.onEvaluated(evaluation, context, this._clock() - started);
    return evaluation;
  }

  /** Boolean convenience — true iff the flag resolves to its 'on' variant. */
  boolValue(flagKey: string, context?: EvalContext): boolean {
    return this.evaluate(flagKey, context).variant === 'on';
  }

  /** The resolved variant id. */
  variant(flagKey: string, context?: EvalContext): string {
    return this.evaluate(flagKey, context).variant;
  }

  /** The resolved variant's payload, typed. */
  value<T = unknown>(flagKey: string, context?: EvalContext): T {
    return this.evaluate(flagKey, context).value as T;
  }

  /* ------------------------- internals ------------------------- */

  private _evaluate(
    flagKey: string,
    context: EvalContext | undefined,
    visiting: Set<string>,
    depth: number
  ): Evaluation {
    const flag = this._store.getFlag(flagKey);
    const flat = flattenContext(context);
    const off = (variant: string | undefined, reason: EvalReason): Evaluation => ({
      flagKey,
      variant: variant ?? 'off',
      value: this._variantValue(flag, variant ?? 'off'),
      reason,
    });

    if (!flag) {
      return {
        flagKey,
        variant: 'off',
        value: undefined,
        reason: 'error',
      };
    }
    if (flag.killed) {
      return off(flag.offVariant, 'killed');
    }
    if (!flag.enabled) {
      return off(flag.offVariant, 'disabled');
    }
    if (depth > this._maxDepth) {
      return { flagKey, variant: 'off', value: undefined, reason: 'error' };
    }

    // Dependency gate — every requirement must hold. Cycle guard via
    // `visiting`: a dependency cycle resolves to unmet (fail closed).
    for (const dep of flag.requires ?? []) {
      if (visiting.has(dep.flag)) {
        return off(flag.offVariant, 'dependency-unmet');
      }
      visiting.add(dep.flag);
      const depResult = this._evaluate(dep.flag, context, visiting, depth + 1);
      visiting.delete(dep.flag);
      const expected = dep.equals ?? 'on';
      const met =
        expected === 'on'
          ? depResult.variant === 'on' || (depResult.reason !== 'killed' && depResult.reason !== 'disabled' && depResult.variant !== 'off')
          : depResult.variant === expected || depResult.value === expected;
      if (!met) {
        return off(flag.offVariant, 'dependency-unmet');
      }
    }

    // Rules — first match wins.
    for (let i = 0; i < (flag.rules?.length ?? 0); i++) {
      const rule = flag.rules![i];
      const clausesOk = (rule.clauses ?? []).every((c) => evalClause(c, flat.attributes));
      if (!clausesOk) {
        continue;
      }
      let segmentOk = true;
      let usedSegment = false;
      for (const segId of rule.segments ?? []) {
        usedSegment = true;
        const seg = this._store.getSegment(segId);
        if (!seg || !seg.clauses.every((c) => evalClause(c, flat.attributes))) {
          segmentOk = false;
          break;
        }
      }
      if (!segmentOk) {
        continue;
      }
      // Rule matched — decide variant.
      const reason: EvalReason = usedSegment ? 'segment-match' : 'rule-match';
      if (rule.rollout) {
        const bucket = this._bucket(flagKey, flag, rule.rollout, flat.key);
        const variant = variantForBucket(rule.rollout, bucket);
        if (variant !== undefined) {
          return { flagKey, variant, value: this._variantValue(flag, variant), reason, ruleId: i, bucket };
        }
        // Rollout produced no variant → user falls out of the rollout.
        continue;
      }
      if (rule.variant !== undefined) {
        return {
          flagKey,
          variant: rule.variant,
          value: this._variantValue(flag, rule.variant),
          reason,
          ruleId: i,
        };
      }
      // Rule with no outcome — keep scanning (unusual but valid).
    }

    // Fallthrough.
    if (flag.defaultVariant !== undefined) {
      return {
        flagKey,
        variant: flag.defaultVariant,
        value: this._variantValue(flag, flag.defaultVariant),
        reason: 'fallthrough',
      };
    }
    return off(flag.offVariant, 'default');
  }

  private _bucket(flagKey: string, _flag: FeatureFlag, rollout: Rollout, key: BucketKey | undefined): number {
    // Anonymous evaluations (no context key) bucket on a stable anonymous
    // key — consistent within a process, not sticky across users (there is
    // no user). Callers wanting sticky-anon should pass a session key.
    const bucketKey = key ?? 'anonymous';
    const salt = rollout.salt ?? '';
    const kind = _flag.tags?.find((t) => t.startsWith('kind:'))?.slice(5) ?? 'user';
    return bucketFor(flagKey, kind, bucketKey, salt);
  }

  private _variantValue(flag: FeatureFlag | undefined, variant: string): unknown {
    if (!flag) {
      return undefined;
    }
    const v = (flag.variants ?? []).find((x) => x.id === variant);
    if (v) {
      return v.value;
    }
    // Boolean convention: 'on' → true, 'off' → false.
    if (flag.type === 'boolean') {
      return variant === 'on' ? true : variant === 'off' ? false : undefined;
    }
    return undefined;
  }
}

/** Helper: standard boolean flag declaration. */
export function boolFlag(key: string, opts: Partial<FeatureFlag> = {}): FeatureFlag {
  return {
    key,
    type: 'boolean',
    enabled: true,
    variants: [
      { id: 'on', value: true },
      { id: 'off', value: false },
    ],
    defaultVariant: 'off',
    offVariant: 'off',
    ...opts,
  };
}

/** Helper: multivariate flag with named variants. */
export function multivariateFlag(
  key: string,
  variants: readonly FlagVariant[],
  opts: Partial<FeatureFlag> = {}
): FeatureFlag {
  return {
    key,
    type: 'multivariate',
    enabled: true,
    variants,
    defaultVariant: variants[0]?.id,
    offVariant: 'off',
    ...opts,
  };
}
