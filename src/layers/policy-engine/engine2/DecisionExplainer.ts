/**
 * Policy Engine — Decision Explanation
 *
 * Re-evaluates a policy tree while recording WHY each element produced
 * its result — the answer to "why was this request denied?":
 *
 *  - Every evaluated element gets a {@link TraceNode}: element id, kind
 *    (policySet | policy | rule), whether it was applicable, the per-
 *    target / per-condition verdict, and the produced effect.
 *  - Rules record the failing reason precisely: target-miss, condition
 *    false, condition indeterminate, or effect produced.
 *  - The combined decision per policy records which combining algorithm
 *    ran and the per-rule effects it consumed — e.g. "deny-overrides
 *    picked deny because rule r3 denied".
 *  - `explain()` returns a tree mirroring the policy structure plus a
 *    flattened narrative (`narrative()`) for logs and audit UIs.
 *
 * Evaluation mirrors `PolicyDecisionPoint`'s semantics (target →
 * condition → effect → combining) — intentionally duplicated rather than
 * extracted, because explanation needs per-node interception hooks the
 * hot path shouldn't pay for.
 *
 * @module PolicyEngine/Engine2
 */

import {
  DecisionEffect,
  ElementResult,
  NormalizedRequest,
  Policy,
  PolicyRequest,
  PolicyRule,
  PolicySet,
  TriState,
  evaluateExpression,
  isPolicySet,
  normalizeRequest,
  targetMatches,
} from '../domain/policy-model';
import { combine } from '../strategies/CombiningAlgorithms';

export type TraceVerdict =
  | 'applicable'      // element produced an effect
  | 'target-miss'     // target didn't match — skipped
  | 'disabled'        // enabled === false
  | 'condition-false' // rule condition evaluated false
  | 'indeterminate';  // condition indeterminate

export interface TraceNode {
  readonly id: string;
  readonly kind: 'policySet' | 'policy' | 'rule';
  readonly verdict: TraceVerdict;
  readonly effect?: DecisionEffect;
  /** For rules: the raw tri-state of the condition (when evaluated). */
  readonly conditionResult?: TriState;
  /** For policies/sets: combining algorithm and per-child effects. */
  readonly combining?: string;
  readonly childEffects?: ReadonlyArray<{ id: string; effect: DecisionEffect }>;
  /** Which effect won combination (when applicable). */
  readonly combinedEffect?: DecisionEffect;
  readonly children: ReadonlyArray<TraceNode>;
  readonly note?: string;
}

export interface DecisionExplanation {
  readonly request: NormalizedRequest;
  readonly decision: DecisionEffect;
  readonly trace: TraceNode;
  /** Rule ids that produced the final effect. */
  readonly decidingRuleIds: ReadonlyArray<string>;
}

export class DecisionExplainer {
  /**
   * Evaluate `root` against `request`, producing a decision + full trace.
   */
  explain(root: Policy | PolicySet, request: PolicyRequest): DecisionExplanation {
    const req = normalizeRequest(request);
    const { node, result } = this._evalElement(root, req);
    return {
      request: req,
      decision: result.decision.effect,
      trace: node,
      decidingRuleIds: result.decision.decidingRuleIds,
    };
  }

  /** Human-readable narrative — the explanation flattened to lines. */
  narrative(explanation: DecisionExplanation): ReadonlyArray<string> {
    const lines: string[] = [];
    const walk = (n: TraceNode, depth: number): void => {
      const indent = '  '.repeat(depth);
      const verdict =
        n.verdict === 'applicable'
          ? `→ ${n.effect}`
          : n.verdict === 'target-miss'
            ? 'target did not match'
            : n.verdict === 'disabled'
              ? 'disabled'
              : n.verdict === 'condition-false'
                ? 'condition false'
                : `indeterminate${n.note ? ` (${n.note})` : ''}`;
      const extra =
        n.combining !== undefined
          ? ` [${n.combining}: ${n.childEffects?.map((c) => `${c.id}=${c.effect}`).join(', ')}]`
          : '';
      lines.push(`${indent}${n.kind} '${n.id}': ${verdict}${extra}`);
      for (const c of n.children) walk(c, depth + 1);
    };
    walk(explanation.trace, 0);
    lines.push(`decision: ${explanation.decision}`);
    if (explanation.decidingRuleIds.length > 0) {
      lines.push(`deciding rules: ${explanation.decidingRuleIds.join(', ')}`);
    }
    return lines;
  }

  /* --------------------------- evaluation --------------------------- */

  private _evalElement(
    el: Policy | PolicySet,
    req: NormalizedRequest
  ): { node: TraceNode; result: ElementResult } {
    return isPolicySet(el) ? this._evalSet(el, req) : this._evalPolicy(el, req);
  }

  private _evalSet(set: PolicySet, req: NormalizedRequest): { node: TraceNode; result: ElementResult } {
    if (set.target && !targetMatches(set.target, req)) {
      return {
        node: { id: set.id, kind: 'policySet', verdict: 'target-miss', children: [] },
        result: empty('notApplicable'),
      };
    }
    const children: TraceNode[] = [];
    const childResults: ElementResult[] = [];
    for (const child of set.policies) {
      const r = this._evalElement(child, req);
      children.push(r.node);
      childResults.push(r.result);
    }
    const decision = combine(set.policyCombining, childResults);
    const node: TraceNode = {
      id: set.id,
      kind: 'policySet',
      verdict: 'applicable',
      effect: decision.effect,
      combining: set.policyCombining,
      childEffects: children.map((c) => ({ id: c.id, effect: c.effect ?? 'notApplicable' })),
      combinedEffect: decision.effect,
      children,
    };
    return {
      node,
      result: {
        decision: { ...decision, decidingPolicyIds: decision.effect === 'notApplicable' ? [] : [set.id, ...decision.decidingPolicyIds] },
        obligations: decision.obligations,
        advice: decision.advice,
      },
    };
  }

  private _evalPolicy(policy: Policy, req: NormalizedRequest): { node: TraceNode; result: ElementResult } {
    if (policy.enabled === false) {
      return {
        node: { id: policy.id, kind: 'policy', verdict: 'disabled', children: [] },
        result: empty('notApplicable'),
      };
    }
    if (policy.target && !targetMatches(policy.target, req)) {
      return {
        node: { id: policy.id, kind: 'policy', verdict: 'target-miss', children: [] },
        result: empty('notApplicable'),
      };
    }
    const children: TraceNode[] = [];
    const ruleResults: ElementResult[] = [];
    for (const rule of policy.rules) {
      const r = this._evalRule(rule, req, policy.id);
      children.push(r.node);
      ruleResults.push(r.result);
    }
    const combined = combine(policy.ruleCombining, ruleResults);
    const node: TraceNode = {
      id: policy.id,
      kind: 'policy',
      verdict: 'applicable',
      effect: combined.effect,
      combining: policy.ruleCombining,
      childEffects: children.map((c) => ({ id: c.id, effect: c.effect ?? 'notApplicable' })),
      combinedEffect: combined.effect,
      children,
    };
    return {
      node,
      result: {
        decision: {
          ...combined,
          decidingPolicyIds: combined.effect === 'notApplicable' ? [] : [policy.id],
        },
        obligations: combined.obligations,
        advice: combined.advice,
      },
    };
  }

  private _evalRule(rule: PolicyRule, req: NormalizedRequest, policyId: string): { node: TraceNode; result: ElementResult } {
    if (rule.enabled === false) {
      return {
        node: { id: rule.id, kind: 'rule', verdict: 'disabled', children: [] },
        result: empty('notApplicable'),
      };
    }
    if (rule.target && !targetMatches(rule.target, req)) {
      return {
        node: { id: rule.id, kind: 'rule', verdict: 'target-miss', children: [] },
        result: empty('notApplicable'),
      };
    }
    if (rule.condition) {
      const tri = evaluateExpression(rule.condition, req);
      if (tri === 'indeterminate') {
        return {
          node: { id: rule.id, kind: 'rule', verdict: 'indeterminate', conditionResult: tri, children: [], note: 'missing attribute or ill-typed operands' },
          result: {
            decision: {
              effect: 'indeterminate',
              obligations: [],
              advice: [],
              decidingPolicyIds: [policyId],
              decidingRuleIds: [rule.id],
            },
            obligations: [],
            advice: [],
          },
        };
      }
      if (tri === 'false') {
        return {
          node: { id: rule.id, kind: 'rule', verdict: 'condition-false', conditionResult: tri, children: [] },
          result: empty('notApplicable'),
        };
      }
    }
    return {
      node: { id: rule.id, kind: 'rule', verdict: 'applicable', effect: rule.effect, conditionResult: rule.condition ? 'true' : undefined, children: [] },
      result: {
        decision: {
          effect: rule.effect,
          obligations: rule.obligations ?? [],
          advice: rule.advice ?? [],
          decidingPolicyIds: [policyId],
          decidingRuleIds: [rule.id],
        },
        obligations: rule.obligations ?? [],
        advice: rule.advice ?? [],
      },
    };
  }
}

function empty(effect: DecisionEffect): ElementResult {
  return {
    decision: { effect, obligations: [], advice: [], decidingPolicyIds: [], decidingRuleIds: [] },
    obligations: [],
    advice: [],
  };
}
