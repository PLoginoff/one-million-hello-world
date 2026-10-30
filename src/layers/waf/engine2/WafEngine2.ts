/**
 * WafEngine2 — composes DSL rules, rate rules, geo-blocking, learning
 * mode, and FP tracking into one evaluation pipeline.
 *
 * Evaluation order (first blocking verdict wins):
 *   1. Per-rule allowlist check (FP tracker) — exempt paths skip the rule
 *   2. GeoBlock
 *   3. RateRules (each observes the request — counting is a side effect)
 *   4. DSL rules in priority order
 *   5. Learning mode records flagged requests for later suggestion
 *
 * @module WafLayer/Engine2
 */

import { WafClock2, WafRequest2, WafVerdict2, SystemWafClock2 } from './types';
import { CompiledDsl } from './RuleDsl';
import { GeoBlock } from './GeoBlock';
import { RateRule, RateRuleOptions } from './RateRule';
import { LearningMode } from './LearningMode';
import { FalsePositiveTracker } from './FalsePositiveTracker';

export interface DslRuleSpec {
  readonly ruleId: string;
  readonly expression: string;
  readonly action: 'log' | 'block' | 'captcha';
  /** Higher priority evaluates first. Default 0. */
  readonly priority?: number;
  /** Learning mode body fragment recorded when this rule flags. */
  readonly fragment?: string;
}

export interface WafEngine2Options {
  clock?: WafClock2;
}

export class WafEngine2 {
  private readonly _clock: WafClock2;
  private readonly _dslRules: { spec: DslRuleSpec; compiled: CompiledDsl }[] = [];
  private readonly _rateRules: RateRule[] = [];
  readonly geo: GeoBlock | null;
  readonly learning: LearningMode;
  readonly fp: FalsePositiveTracker;

  constructor(
    opts: WafEngine2Options & {
      geo?: GeoBlock;
      learning?: LearningMode;
      fp?: FalsePositiveTracker;
    } = {}
  ) {
    this._clock = opts.clock ?? new SystemWafClock2();
    this.geo = opts.geo ?? null;
    this.learning = opts.learning ?? new LearningMode({ clock: this._clock });
    this.fp = opts.fp ?? new FalsePositiveTracker();
  }

  /** Add a DSL rule. */
  addRule(spec: DslRuleSpec): void {
    this._dslRules.push({ spec, compiled: new CompiledDsl(spec.expression) });
    this._dslRules.sort((a, b) => (b.spec.priority ?? 0) - (a.spec.priority ?? 0));
  }

  removeRule(ruleId: string): boolean {
    const i = this._dslRules.findIndex((r) => r.spec.ruleId === ruleId);
    if (i < 0) return false;
    this._dslRules.splice(i, 1);
    return true;
  }

  /** Add a rate rule. */
  addRateRule(opts: RateRuleOptions): RateRule {
    const r = new RateRule(opts, this._clock);
    this._rateRules.push(r);
    return r;
  }

  /**
   * Evaluate a request through the pipeline. Returns the first blocking
   * verdict, a log verdict when only log rules matched, or allow.
   */
  evaluate(req: WafRequest2): WafVerdict2 {
    // Geo first — cheapest categorical filter.
    if (this.geo) {
      const v = this.geo.evaluate(req);
      if (v && v.action === 'block' && !this.fp.isAllowed(v.ruleId, req.path)) {
        this.fp.recordBlock(v.ruleId);
        this.learning.observeFlagged(req);
        return v;
      }
    }

    // Rate rules count every matching request (side effect).
    for (const rule of this._rateRules) {
      const hit = rule.observe(req);
      if (hit && hit.action === 'block' && !this.fp.isAllowed(rule.ruleId, req.path)) {
        this.fp.recordBlock(rule.ruleId);
        this.learning.observeFlagged(req);
        return { action: 'block', ruleId: rule.ruleId, reason: hit.reason, score: 0.8 };
      }
      if (hit && hit.action === 'log') {
        this.learning.observeFlagged(req);
      }
    }

    // DSL rules in priority order.
    const logAnnotations: string[] = [];
    let firstLog: { ruleId: string; reason: string } | null = null;
    for (const { spec, compiled } of this._dslRules) {
      if (this.fp.isAllowed(spec.ruleId, req.path)) continue;
      if (!compiled.matches(req)) continue;
      if (spec.action === 'block' || spec.action === 'captcha') {
        this.fp.recordBlock(spec.ruleId);
        this.learning.observeFlagged(req, spec.fragment);
        return {
          action: 'block',
          ruleId: spec.ruleId,
          reason: `DSL rule '${spec.ruleId}' matched: ${spec.expression}`,
          score: 0.85,
        };
      }
      // log action: annotate, observe, keep evaluating.
      this.learning.observeFlagged(req, spec.fragment);
      if (!firstLog) firstLog = { ruleId: spec.ruleId, reason: spec.expression };
      logAnnotations.push(spec.ruleId);
    }

    if (firstLog) {
      return { action: 'log', ruleId: firstLog.ruleId, reason: firstLog.reason };
    }
    this.learning.observeBenign(req);
    return { action: 'allow', annotations: logAnnotations };
  }

  /** Adopt a learning-mode suggestion as a real rule. */
  adoptSuggestion(suggestion: { expression: string }, ruleId: string, action: 'log' | 'block' = 'log'): void {
    this.addRule({ ruleId, expression: suggestion.expression, action, priority: 0 });
  }

  get ruleCount(): number {
    return this._dslRules.length + this._rateRules.length + (this.geo ? 1 : 0);
  }
}
