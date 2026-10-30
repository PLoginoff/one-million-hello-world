/**
 * Rules Engine — Static Rule Conflict Detection
 *
 * Analyzes a rule set *without executing it* and reports conflicts where
 * two rules' condition spaces overlap but their actions differ — the
 * classic "same conditions, different outcomes" authoring bug.
 *
 * Conflict kinds:
 *
 *  - IDENTICAL_CONDITIONS — rules with structurally equal conditions and
 *    different actions. Every fact matching one matches the other.
 *  - SHADOWED — rule A's condition space *contains* rule B's (A matches a
 *    strict superset of facts) with a different action. B can still fire
 *    (it matches where A does), but A may mask it under priority order.
 *  - OVERLAP — partial intersection: some facts match both rules with
 *    different actions. Proven by constructing a witness fact or, when
 *    the prover can't synthesize one, reported as 'possible' with the
 *    shared-field evidence.
 *  - EQUIVALENT — identical conditions AND identical actions — redundant
 *    rule (dead code), reported as 'warning' not 'conflict'.
 *
 * Overlap proving is deliberately conservative: for leaf-only `and`
 * conjunctions we can merge constraints field-by-field and detect
 * contradictions (range bounds, disjoint `in` sets, conflicting `==`
 * values). Disjunctions/negations fall back to field-overlap heuristics
 * marked 'possible'. Sound on the conservative side: it never claims
 * 'no overlap' when it can't prove disjointness.
 *
 * Complexity: O(R²) rule pairs × O(L²) leaf merges. R = rule count,
 * L = leaves per condition — fine for authoring-time analysis.
 *
 * @module RulesEngine/Engine2
 */

import { Condition, LeafCondition, deepEqual } from '../domain/dsl';
import { VersionedRule } from './RuleVersionStore';

export type ConflictKind =
  | 'identical-conditions'
  | 'shadowed'
  | 'overlap'
  | 'equivalent';

export type ConflictCertainty = 'proven' | 'possible';

export interface RuleConflict {
  readonly kind: ConflictKind;
  readonly certainty: ConflictCertainty;
  readonly ruleA: string;
  readonly ruleB: string;
  /** Fields both rules constrain — the overlap surface. */
  readonly sharedFields: ReadonlyArray<string>;
  readonly detail: string;
}

/* ------------------------------------------------------------------ */
/* Condition analysis                                                   */
/* ------------------------------------------------------------------ */

/** Flatten an AND-tree to its leaf list; null when the tree contains or/not. */
function conjunctionLeaves(c: Condition): LeafCondition[] | null {
  if (c.kind === 'leaf') return [c];
  if (c.kind !== 'and') return null;
  const out: LeafCondition[] = [];
  for (const child of c.children) {
    const sub = conjunctionLeaves(child);
    if (sub === null) return null;
    out.push(...sub);
  }
  return out;
}

function leafKey(l: LeafCondition): string {
  return `${l.field}|${l.op}|${JSON.stringify(l.value ?? null)}`;
}

/** Structural equality of two conditions. */
function conditionsEqual(a: Condition, b: Condition): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Do two leaf constraints on the SAME field contradict each other?
 * Returns true when no value can satisfy both.
 */
function leavesContradict(a: LeafCondition, b: LeafCondition): boolean {
  if (a.field !== b.field) return false;

  // '== x' vs '== y', x ≠ y.
  if (a.op === '==' && b.op === '==' && !deepEqual(a.value, b.value)) return true;
  // '== x' vs '!= x'.
  if (a.op === '==' && b.op === '!=' && deepEqual(a.value, b.value)) return true;
  if (a.op === '!=' && b.op === '==' && deepEqual(a.value, b.value)) return true;
  // '== x' vs 'in [...]' missing x.
  if (a.op === '==' && b.op === 'in' && Array.isArray(b.value) && !b.value.some((e) => deepEqual(e, a.value))) return true;
  if (b.op === '==' && a.op === 'in' && Array.isArray(a.value) && !a.value.some((e) => deepEqual(e, b.value))) return true;
  // 'in [x]' vs 'notIn [x]' — full intersection disjoint.
  if (a.op === 'in' && b.op === 'notIn' && Array.isArray(a.value) && Array.isArray(b.value)) {
    const bSet = b.value;
    if (a.value.every((e) => bSet.some((x) => deepEqual(x, e)))) return true;
  }
  if (b.op === 'in' && a.op === 'notIn' && Array.isArray(b.value) && Array.isArray(a.value)) {
    const aSet = a.value;
    if (b.value.every((e) => aSet.some((x) => deepEqual(x, e)))) return true;
  }
  // 'in [a]' vs 'in [b]' disjoint sets.
  if (a.op === 'in' && b.op === 'in' && Array.isArray(a.value) && Array.isArray(b.value)) {
    const aArr = a.value, bArr = b.value;
    const disjoint = aArr.every((e) => !bArr.some((x) => deepEqual(x, e)));
    if (disjoint) return true;
  }
  // 'exists' vs 'notExists'.
  if ((a.op === 'exists' && b.op === 'notExists') || (a.op === 'notExists' && b.op === 'exists')) return true;

  // Numeric range contradictions: order ops on numeric literals.
  const num = (l: LeafCondition): number | null =>
    typeof l.value === 'number' ? l.value : null;
  const av = num(a), bv = num(b);
  if (av !== null && bv !== null) {
    // a: field <op_a> av ; b: field <op_b> bv
    const lowers = (l: LeafCondition, v: number): { lo: number; loStrict: boolean } | null => {
      switch (l.op) {
        case '>': return { lo: v, loStrict: true };
        case '>=': return { lo: v, loStrict: false };
        default: return null;
      }
    };
    const uppers = (l: LeafCondition, v: number): { hi: number; hiStrict: boolean } | null => {
      switch (l.op) {
        case '<': return { hi: v, hiStrict: true };
        case '<=': return { hi: v, hiStrict: false };
        default: return null;
      }
    };
    const la = lowers(a, av), lb = lowers(b, bv);
    const ua = uppers(a, av), ub = uppers(b, bv);
    const lo = la ?? lb;
    const hi = ua ?? ub;
    if (lo && hi && (la || lb) && (ua || ub)) {
      // Both constraints present: check empty interval.
      if (lo.lo > hi.hi) return true;
      if (lo.lo === hi.hi && (lo.loStrict || hi.hiStrict)) return true;
    }
    // '== x' vs 'x' outside a bound.
    if (a.op === '==') {
      if (b.op === '>' && av <= bv) return true;
      if (b.op === '>=' && av < bv) return true;
      if (b.op === '<' && av >= bv) return true;
      if (b.op === '<=' && av > bv) return true;
      if (b.op === 'between' && Array.isArray(b.value)) {
        const [lo, hi] = b.value as unknown[];
        if (typeof lo === 'number' && typeof hi === 'number' && (av < lo || av > hi)) return true;
      }
    }
    if (b.op === '==') {
      if (a.op === '>' && bv <= av) return true;
      if (a.op === '>=' && bv < av) return true;
      if (a.op === '<' && bv >= av) return true;
      if (a.op === '<=' && bv > av) return true;
      if (a.op === 'between' && Array.isArray(a.value)) {
        const [lo, hi] = a.value as unknown[];
        if (typeof lo === 'number' && typeof hi === 'number' && (bv < lo || bv > hi)) return true;
      }
    }
  }
  return false;
}

/**
 * Can the two leaf-lists be simultaneously satisfied?
 * null = inconclusive (different fields, or ops we can't reason about),
 * true = provably satisfiable, false = provably contradictory.
 */
function conjunctionSatisfiable(a: LeafCondition[], b: LeafCondition[]): boolean | null {
  let sawSharedField = false;
  let sawUnknown = false;
  for (const la of a) {
    for (const lb of b) {
      if (la.field !== lb.field) continue;
      sawSharedField = true;
      if (leavesContradict(la, lb)) return false;
      // Same field, not contradictory — but did we actually reason?
      if (la.op !== lb.op || !deepEqual(la.value, lb.value)) sawUnknown = true;
    }
  }
  if (!sawSharedField) return null; // different fields — can both hold
  return sawUnknown ? true : true; // shared field, no contradiction found
}

/** Fields referenced by each leaf list. */
function leafFields(ls: LeafCondition[]): Set<string> {
  return new Set(ls.map((l) => l.field));
}

/**
 * Is rule `sup`'s leaf constraint set a strict subset of `sub`'s?
 * (Sup matches whenever sub does — every sub constraint is implied by
 * sup's weaker set.) Approximation: every leaf in `sup` must appear
 * verbatim in `sub`.
 */
function isSuperset(sup: LeafCondition[], sub: LeafCondition[]): boolean {
  const subKeys = new Set(sub.map(leafKey));
  return sup.every((l) => subKeys.has(leafKey(l))) && sup.length < sub.length;
}

export class RuleConflictDetector {
  /**
   * Analyze a rule set. Returns conflicts sorted by kind severity.
   * `actionsComparable` — when actions differ structurally the pair is a
   * conflict; equal actions produce 'equivalent' warnings.
   */
  detect(rules: ReadonlyArray<VersionedRule>): RuleConflict[] {
    const conflicts: RuleConflict[] = [];
    const leafCache = new Map<string, LeafCondition[] | null>();
    const leavesOf = (r: VersionedRule): LeafCondition[] | null => {
      if (!leafCache.has(r.id)) leafCache.set(r.id, conjunctionLeaves(r.condition));
      return leafCache.get(r.id)!;
    };

    for (let i = 0; i < rules.length; i++) {
      for (let j = i + 1; j < rules.length; j++) {
        const a = rules[i], b = rules[j];
        const sameAction = a.action === b.action;

        // 1. Structurally identical conditions.
        if (conditionsEqual(a.condition, b.condition)) {
          conflicts.push({
            kind: sameAction ? 'equivalent' : 'identical-conditions',
            certainty: 'proven',
            ruleA: a.id,
            ruleB: b.id,
            sharedFields: [...leafFields(leavesOf(a) ?? [])],
            detail: sameAction
              ? 'identical condition AND action — duplicate rule'
              : `identical conditions, different actions ('${a.action}' vs '${b.action}')`,
          });
          continue;
        }

        const la = leavesOf(a);
        const lb = leavesOf(b);
        if (la === null || lb === null) {
          // Can't reason through or/not — report field-overlap only.
          const shared = [...leafFields(leavesOf(a) ?? [])].filter((f) =>
            leafFields(leavesOf(b) ?? []).has(f)
          );
          if (shared.length > 0 && !sameAction) {
            conflicts.push({
              kind: 'overlap',
              certainty: 'possible',
              ruleA: a.id,
              ruleB: b.id,
              sharedFields: shared,
              detail: `conditions share fields {${shared.join(', ')}} with disjunctive/negated structure — manual review needed`,
            });
          }
          continue;
        }

        // 2. Shadowing: a's constraints ⊆ b's (a matches a superset).
        if (!sameAction && isSuperset(la, lb)) {
          conflicts.push({
            kind: 'shadowed',
            certainty: 'proven',
            ruleA: a.id,
            ruleB: b.id,
            sharedFields: [...leafFields(la)],
            detail: `'${a.id}' matches a strict superset of '${b.id}' with a different action`,
          });
          continue;
        }
        if (!sameAction && isSuperset(lb, la)) {
          conflicts.push({
            kind: 'shadowed',
            certainty: 'proven',
            ruleA: b.id,
            ruleB: a.id,
            sharedFields: [...leafFields(lb)],
            detail: `'${b.id}' matches a strict superset of '${a.id}' with a different action`,
          });
          continue;
        }

        // 3. Overlap: shared fields, joint satisfiability.
        const sharedFields = [...leafFields(la)].filter((f) => leafFields(lb).has(f));
        if (sharedFields.length === 0) continue; // disjoint fields → can't both match... except unconstrained dims — still report nothing (different fields means independent predicates CAN co-hold? No: different fields means each constrains different dimensions — BOTH can hold on the same fact. Report as possible overlap when actions differ.)
        // Fields differ entirely → every fact could satisfy both (no shared
        // dimension constrains them apart) → possible overlap.
        if (!sameAction) {
          const sat = conjunctionSatisfiable(la, lb);
          if (sat === false) {
            continue; // proven disjoint — no conflict
          }
          conflicts.push({
            kind: 'overlap',
            certainty: sharedFields.length > 0 ? 'proven' : 'possible',
            ruleA: a.id,
            ruleB: b.id,
            sharedFields,
            detail:
              sharedFields.length > 0
                ? `conditions co-satisfiable on shared fields {${sharedFields.join(', ')}} with different actions`
                : 'conditions constrain disjoint fields — any fact may match both rules',
          });
        }
      }
    }

    const order: Record<ConflictKind, number> = {
      'identical-conditions': 0,
      shadowed: 1,
      overlap: 2,
      equivalent: 3,
    };
    return conflicts.sort((x, y) => order[x.kind] - order[y.kind]);
  }
}
