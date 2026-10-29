/**
 * Policy/rule combining algorithms.
 *
 * Each algorithm is a pure function over an ordered list of
 * {@link ElementResult}s — one per evaluated rule, policy, or nested set —
 * producing a single combined {@link Decision}. Algorithms are used both for
 * rule-combining inside a {@link Policy} and policy-combining inside a
 * {@link PolicySet} (XACML treats them symmetrically).
 *
 * Semantics (XACML 3.0 §C):
 *
 * | Algorithm               | deny | permit | n/a | indeterminate            |
 * |-------------------------|------|--------|-----|--------------------------|
 * | deny-overrides          | any→deny | else any permit→permit | else n/a | else indeterminate |
 * | permit-overrides        | (mirror of above)                                        |
 * | first-applicable        | first result ≠ n/a wins (indeterminate counts) |
 * | only-one-applicable     | >1 applicable → indeterminate                  |
 * | majority                | strict majority of permit/deny wins; tie→n/a or indeterminate |
 * | ordered-*-overrides     | like *-overrides but obligations merge in evaluation order |
 *
 * Obligations/advice: when the combined effect is permit or deny, the
 * obligations of every contributing element *with the same effect* are
 * merged (de-duplicated by obligation id, first occurrence wins).
 *
 * @module PolicyEngine/Strategies
 */

import {
  Decision,
  DecisionEffect,
  ElementResult,
  Obligation,
  Advice,
  CombiningAlgorithm,
  NOT_APPLICABLE,
} from '../domain/policy-model';

/** Options controlling edge-case behaviour. */
export interface CombineOptions {
  /**
   * Majority ties (equal permit and deny counts): `'notApplicable'`
   * (default) or `'indeterminate'` or `'deny'` (fail-safe bias).
   */
  readonly majorityTie?: 'notApplicable' | 'indeterminate' | 'deny';
}

/** Combines element results per the named algorithm. */
export function combine(
  algorithm: CombiningAlgorithm,
  results: readonly ElementResult[],
  options: CombineOptions = {}
): Decision {
  switch (algorithm) {
    case 'deny-overrides':
      return denyOverrides(results, false);
    case 'ordered-deny-overrides':
      return denyOverrides(results, true);
    case 'permit-overrides':
      return permitOverrides(results, false);
    case 'ordered-permit-overrides':
      return permitOverrides(results, true);
    case 'first-applicable':
      return firstApplicable(results);
    case 'only-one-applicable':
      return onlyOneApplicable(results);
    case 'majority':
      return majority(results, options.majorityTie ?? 'notApplicable');
  }
}

/**
 * Deny-overrides: any deny wins. If none, any permit wins. If all
 * notApplicable → notApplicable. Indeterminate survives only when nothing
 * else produced a verdict.
 */
export function denyOverrides(results: readonly ElementResult[], ordered: boolean): Decision {
  return overrides(results, 'deny', ordered);
}

export function permitOverrides(results: readonly ElementResult[], ordered: boolean): Decision {
  return overrides(results, 'permit', ordered);
}

function overrides(
  results: readonly ElementResult[],
  dominant: 'permit' | 'deny',
  ordered: boolean
): Decision {
  const recessive: DecisionEffect = dominant === 'deny' ? 'permit' : 'deny';
  let sawRecessive = false;
  let sawIndeterminate = false;
  const dominantResults: ElementResult[] = [];
  const recessiveResults: ElementResult[] = [];

  for (const r of results) {
    const e = r.decision.effect;
    if (e === dominant) {
      if (!ordered) {
        // Unordered: can short-circuit only for deny-dominant? No — XACML
        // unordered allows short-circuit for either; but we still collect
        // obligations for the audit trail, so keep scanning.
      }
      dominantResults.push(r);
    } else if (e === recessive) {
      recessiveResults.push(r);
      sawRecessive = true;
    } else if (e === 'indeterminate') {
      sawIndeterminate = true;
    }
  }

  if (dominantResults.length > 0) {
    return finalize(dominant, dominantResults, ordered);
  }
  if (sawRecessive) {
    return finalize(recessive, recessiveResults, ordered);
  }
  if (sawIndeterminate) {
    return bare('indeterminate', 'all elements not applicable except indeterminate results');
  }
  return { ...NOT_APPLICABLE };
}

/**
 * First-applicable: evaluation order is policy order. The first result whose
 * effect is not `notApplicable` decides — including `indeterminate`.
 */
export function firstApplicable(results: readonly ElementResult[]): Decision {
  for (const r of results) {
    if (r.decision.effect !== 'notApplicable') {
      return {
        effect: r.decision.effect,
        obligations: effectMatches(r.decision.effect) ? r.obligations : [],
        advice: r.advice,
        decidingPolicyIds: r.decision.decidingPolicyIds,
        decidingRuleIds: r.decision.decidingRuleIds,
        reason: r.decision.reason,
      };
    }
  }
  return { ...NOT_APPLICABLE };
}

/**
 * Only-one-applicable: exactly one element may produce a non-n/a result.
 * More than one applicable → indeterminate (the policy set is ambiguous).
 */
export function onlyOneApplicable(results: readonly ElementResult[]): Decision {
  const applicable = results.filter((r) => r.decision.effect !== 'notApplicable');
  if (applicable.length === 0) {
    return { ...NOT_APPLICABLE };
  }
  if (applicable.length > 1) {
    return bare(
      'indeterminate',
      `only-one-applicable violated: ${applicable.length} applicable elements`
    );
  }
  const r = applicable[0];
  return {
    effect: r.decision.effect,
    obligations: r.obligations,
    advice: r.advice,
    decidingPolicyIds: r.decision.decidingPolicyIds,
    decidingRuleIds: r.decision.decidingRuleIds,
    reason: r.decision.reason,
  };
}

/**
 * Majority vote over permit/deny results. Indeterminate results count as
 * abstentions. Not-applicable results count as abstentions too — majority is
 * computed among decided elements.
 *
 * Requires a *strict* majority: permit wins when permitCount >
 * decided/2. On exact ties the configured `majorityTie` fallback applies.
 */
export function majority(
  results: readonly ElementResult[],
  tie: 'notApplicable' | 'indeterminate' | 'deny'
): Decision {
  const permits: ElementResult[] = [];
  const denies: ElementResult[] = [];
  let indeterminates = 0;
  for (const r of results) {
    if (r.decision.effect === 'permit') {
      permits.push(r);
    } else if (r.decision.effect === 'deny') {
      denies.push(r);
    } else if (r.decision.effect === 'indeterminate') {
      indeterminates++;
    }
  }
  const decided = permits.length + denies.length;
  if (decided === 0) {
    if (indeterminates > 0) {
      return bare('indeterminate', 'no decided elements; only indeterminate');
    }
    return { ...NOT_APPLICABLE };
  }
  if (permits.length > decided / 2) {
    return finalize('permit', permits, false);
  }
  if (denies.length > decided / 2) {
    return finalize('deny', denies, false);
  }
  // Tie.
  if (tie === 'deny') {
    return finalize('deny', denies.length > 0 ? denies : permits, false);
  }
  if (tie === 'indeterminate') {
    return bare('indeterminate', `majority tie (${permits.length}P/${denies.length}D)`);
  }
  return { ...NOT_APPLICABLE, reason: `majority tie (${permits.length}P/${denies.length}D)` };
}

/* ------------------------------- helpers ------------------------------- */

function effectMatches(e: DecisionEffect): e is 'permit' | 'deny' {
  return e === 'permit' || e === 'deny';
}

/**
 * Builds the combined decision for the winning effect. Merges obligations
 * and advice from all contributing results that produced that effect,
 * de-duplicated by id (first occurrence wins in ordered mode; in unordered
 * mode obligations are still merged — XACML §7.18).
 */
function finalize(effect: 'permit' | 'deny', contributing: readonly ElementResult[], ordered: boolean): Decision {
  const obligations = dedup(
    contributing.flatMap((r) => (r.decision.effect === effect ? r.obligations : [])),
    (o) => o.id
  );
  const advice = dedup(
    contributing.flatMap((r) => (r.decision.effect === effect ? r.advice : [])),
    (a) => a.id
  );
  const policyIds = dedup(contributing.flatMap((r) => r.decision.decidingPolicyIds), (s) => s);
  const ruleIds = dedup(contributing.flatMap((r) => r.decision.decidingRuleIds), (s) => s);
  void ordered; // ordering affects merge order which dedup preserves anyway
  return { effect, obligations, advice, decidingPolicyIds: policyIds, decidingRuleIds: ruleIds };
}

function bare(effect: DecisionEffect, reason: string): Decision {
  return {
    effect,
    obligations: [],
    advice: [],
    decidingPolicyIds: [],
    decidingRuleIds: [],
    reason,
  };
}

function dedup<T>(items: readonly T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const i of items) {
    const k = key(i);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(i);
    }
  }
  return out;
}

export type { Obligation, Advice };
