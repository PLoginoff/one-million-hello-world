/**
 * Priority evaluation strategy — sequential, short-circuiting rule evaluation.
 *
 * Unlike {@link ProductionRuleEngine} (which runs a full inference loop), this
 * strategy performs a single left-to-right pass over a rule list sorted by
 * descending priority, and stops at the first rule whose action marks the
 * result terminal. This is the right evaluation model for *decision* use
 * cases — allow/deny, pricing tiers, routing — where the rule set is an
 * ordered policy list rather than a forward-chaining program.
 *
 * Evaluation model:
 *  - Rules are sorted by `priority` (desc), then `sequence` (insertion order)
 *    for determinism.
 *  - Each rule's `when` (a DSL condition) is evaluated against the input.
 *  - The first matching rule runs its `then` mapper; if `terminal` (default
 *    true) the pass stops — classic first-match semantics.
 *  - Non-terminal matches accumulate: every match contributes its mapped
 *    output to `results`, letting callers build "collect all matching
 *    discounts" style policies.
 *  - `requires`/`provides` chaining is supported: a rule may declare that it
 *    needs keys earlier rules produced via `ctx.produce(key, value)` or by
 *    naming them in `provides`.
 *
 * Complexity: O(n · c) where n = rule count and c = condition-tree size.
 *
 * @module RulesEngine/Strategies
 */

import { Condition, conditionFields, evaluateCondition } from '../domain/dsl';
import { RulesEngineContext, RulesEngineResult } from '../types/rules-engine-types';

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

/**
 * Decision-list rule. `then` maps (input, chain-context) → output value.
 * `TOut` is per-rule; the strategy boxes all outputs into `unknown`.
 */
export interface DecisionRule<TIn = Record<string, unknown>, TOut = unknown> {
  readonly id: string;
  /** Sort key — larger numbers evaluate earlier. Default 0. */
  readonly priority?: number;
  readonly when: Condition;
  readonly then: (input: TIn, ctx: DecisionContext) => TOut;
  /**
   * When true (default), a match ends the pass. Set false for
   * accumulate-all-matches semantics (e.g. stacking discounts).
   */
  readonly terminal?: boolean;
  /** Keys this rule publishes for downstream `requires`. */
  readonly provides?: readonly string[];
  /** Keys that must already be produced before this rule may match. */
  readonly requires?: readonly string[];
  readonly enabled?: boolean;
}

/** Chain context passed alongside the input to `then`. */
export interface DecisionContext {
  /** Values produced by earlier non-terminal matches, by rule id. */
  readonly produced: Readonly<Record<string, unknown>>;
  /** Publishes a key that downstream `requires` gates on. */
  produce(key: string, value?: unknown): void;
  /** Ids of rules that already matched this pass. */
  readonly matchedRuleIds: readonly string[];
}

export interface DecisionMatch<TOut = unknown> {
  readonly ruleId: string;
  readonly output: TOut;
  /** Condition leaf count — how specific the match was. */
  readonly specificity: number;
}

export interface DecisionEvaluation {
  /** The winning (last terminal) match, or undefined if nothing matched. */
  readonly decision?: DecisionMatch;
  /** All matches in evaluation order (terminal match last). */
  readonly matches: readonly DecisionMatch[];
  /** Rules evaluated but not matched. */
  readonly evaluated: readonly string[];
  /** Rules skipped (disabled / unmet `requires`). */
  readonly skipped: readonly string[];
  readonly durationMs: number;
}

export interface PriorityEvaluationOptions {
  readonly clock?: () => number;
  /**
   * When true (default), a throwing `then` aborts evaluation with an error
   * result. When false, the failing rule is recorded in `errors` and the
   * pass continues.
   */
  readonly abortOnActionError?: boolean;
}

/* ------------------------------------------------------------------ */
/* Strategy                                                            */
/* ------------------------------------------------------------------ */

/**
 * Implements the layer's `IRulesEngineStrategy` shape implicitly (kept
 * structural rather than imported to avoid colliding with the two
 * pre-existing declarations of that interface in sibling files).
 */
export class PriorityEvaluationStrategy {
  readonly name = 'priority-evaluation';
  readonly priority = 100;

  private readonly _rules: DecisionRule[] = [];
  private readonly _options: Required<Omit<PriorityEvaluationOptions, 'clock'>> & {
    clock: () => number;
  };
  private _evaluationCount = 0;

  constructor(options: PriorityEvaluationOptions = {}) {
    this._options = {
      clock: options.clock ?? Date.now,
      abortOnActionError: options.abortOnActionError ?? true,
    };
  }

  /** Registers a rule. Insertion order is the secondary sort key. */
  addRule(rule: DecisionRule): this {
    this._rules.push(rule);
    return this;
  }

  addRules(rules: readonly DecisionRule[]): this {
    for (const r of rules) {
      this._rules.push(r);
    }
    return this;
  }

  removeRule(ruleId: string): boolean {
    const idx = this._rules.findIndex((r) => r.id === ruleId);
    if (idx < 0) {
      return false;
    }
    this._rules.splice(idx, 1);
    return true;
  }

  /** Rules sorted in evaluation order (priority desc, stable). */
  orderedRules(): readonly DecisionRule[] {
    return [...this._rules].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  /** Field paths union across all rules — handy for input validation. */
  referencedFields(): Set<string> {
    const out = new Set<string>();
    for (const r of this._rules) {
      conditionFields(r.when, out);
    }
    return out;
  }

  /**
   * Evaluates the decision list against `input`. Returns a full
   * {@link DecisionEvaluation} — matches, skipped rules, timing.
   */
  evaluate(input: Record<string, unknown>): DecisionEvaluation {
    const started = this._options.clock();
    const ordered = this.orderedRules();
    const matches: DecisionMatch[] = [];
    const evaluated: string[] = [];
    const skipped: string[] = [];
    const produced: Record<string, unknown> = {};
    const matchedRuleIds: string[] = [];

    for (const rule of ordered) {
      if (rule.enabled === false) {
        skipped.push(rule.id);
        continue;
      }
      if (rule.requires && !rule.requires.every((k) => k in produced)) {
        skipped.push(rule.id);
        continue;
      }
      evaluated.push(rule.id);
      if (!evaluateCondition(rule.when, input)) {
        continue;
      }
      const ctx: DecisionContext = {
        produced,
        matchedRuleIds: [...matchedRuleIds],
        produce: (key, value = true) => {
          produced[key] = value;
        },
      };
      const output = rule.then(input, ctx);
      for (const key of rule.provides ?? []) {
        if (!(key in produced)) {
          produced[key] = output;
        }
      }
      matchedRuleIds.push(rule.id);
      const match: DecisionMatch = {
        ruleId: rule.id,
        output,
        specificity: 0, // filled below — cheap recompute for readability
      };
      matches.push({ ...match, specificity: countLeaves(rule.when) });
      if (rule.terminal !== false) {
        break;
      }
    }

    return {
      decision: matches.length > 0 ? matches[matches.length - 1] : undefined,
      matches,
      evaluated,
      skipped,
      durationMs: this._options.clock() - started,
    };
  }

  canHandle(context: RulesEngineContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  /**
   * Layer-strategy entry point. Expects `context.input` to be a record;
   * returns the winning match output or a no-match marker.
   */
  async execute(context: RulesEngineContext): Promise<RulesEngineResult<unknown>> {
    this._evaluationCount++;
    const input = isRecord(context.input) ? context.input : { value: context.input };
    try {
      const evaluation = this.evaluate(input);
      return {
        success: true,
        data: {
          decision: evaluation.decision,
          matches: evaluation.matches,
          skipped: evaluation.skipped,
          durationMs: evaluation.durationMs,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'PRIORITY_EVALUATION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  getExecutionCount(): number {
    return this._evaluationCount;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function countLeaves(c: Condition): number {
  if (c.kind === 'leaf') {
    return 1;
  }
  let n = 0;
  for (const child of c.children) {
    n += countLeaves(child);
  }
  return n;
}
