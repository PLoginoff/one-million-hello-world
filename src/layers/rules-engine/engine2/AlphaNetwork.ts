/**
 * Rules Engine — RETE-Style Alpha Network
 *
 * The alpha half of a RETE network: leaf-level tests (alpha nodes) are
 * shared across every rule that uses them, so a fact is tested against
 * each distinct leaf predicate ONCE regardless of how many rules use it.
 * With N rules averaging L leaves, naive evaluation costs N×L leaf tests
 * per fact; the alpha network costs ≤ D tests where D = number of
 * DISTINCT leaves (plus cheap propagation).
 *
 * Structure:
 *
 *   fact ──> field index ──> alpha nodes (leaf predicates, deduped)
 *                              │ pass
 *                              ▼
 *                         rule leaves (references)
 *                              │ all leaves pass?
 *                              ▼
 *                         rule activated (AND-semantics)
 *
 * Implementation notes:
 *  - Each alpha node wraps one {@link LeafCondition}; nodes are deduped by
 *    structural key `field|op|value`.
 *  - A field→node index (`fieldIndex`) limits which nodes run: a leaf on
 *    field `user.age` is only evaluated when the fact *contains* that
 *    path — absent paths skip the node entirely (still recorded false,
 *    which is correct for every operator except `notExists`, handled by
 *    evaluating those eagerly).
 *  - Rules compile to AND-trees: each rule's flattened leaf list
 *    references shared alpha nodes; a rule "activates" when all its
 *    leaves pass. OR/NOT subtrees remain per-rule residual conditions —
 *    they can't share (boolean structure differs) and are evaluated after
 *    the shared alpha pass inside a full `evaluateCondition` check for
 *    candidate rules only.
 *  - `match(fact)` returns activated rule ids in registration order —
 *    deterministic output for agenda consumption.
 *
 * The network is rebuilt atomically on `compile()` — rule-set updates go
 * through the version store, then a fresh network replaces the old.
 *
 * @module RulesEngine/Engine2
 */

import { Condition, LeafCondition, evaluateCondition, resolvePath } from '../domain/dsl';
import { VersionedRule } from './RuleVersionStore';

/** One shared leaf predicate. */
interface AlphaNode {
  readonly key: string;
  readonly leaf: LeafCondition;
  /** Cached last result for introspection. */
  lastResult: boolean;
  evaluations: number;
}

/** Compiled rule: shared alpha leaves + residual condition. */
interface CompiledRule {
  readonly rule: VersionedRule;
  readonly alphaNodes: AlphaNode[];
  /** Condition minus the shared leaves — evaluated only when alphas pass. */
  readonly residual: Condition | null;
}

function leafKey(l: LeafCondition): string {
  return `${l.field}|${l.op}|${JSON.stringify(l.value ?? null)}`;
}

/**
 * Split a condition into (flattenable AND leaves, residual).
 * - Pure AND trees: all leaves shared, residual null.
 * - OR/NOT subtrees: kept whole as the residual — their internals may
 *   still contain leaves but boolean structure blocks safe sharing
 *   (a leaf inside `or` must not gate the rule, and negation would
 *   invert shared results).
 */
function splitCondition(c: Condition): { leaves: LeafCondition[]; residual: Condition | null } {
  if (c.kind === 'leaf') return { leaves: [c], residual: null };
  if (c.kind === 'and') {
    const leaves: LeafCondition[] = [];
    const residualParts: Condition[] = [];
    for (const child of c.children) {
      const s = splitCondition(child);
      leaves.push(...s.leaves);
      if (s.residual) residualParts.push(s.residual);
    }
    const residual =
      residualParts.length === 0
        ? null
        : residualParts.length === 1
          ? residualParts[0]
          : ({ kind: 'and', children: residualParts } as Condition);
    return { leaves, residual };
  }
  // or/not — opaque residual.
  return { leaves: [], residual: c };
}

export interface AlphaNetworkStats {
  readonly alphaNodes: number;
  readonly rules: number;
  /** Leaf evaluations performed in the last match() call. */
  readonly lastLeafEvaluations: number;
  /** Naive-equivalent leaf evaluations (sum of per-rule leaf counts). */
  readonly naiveLeafEvaluations: number;
  readonly sharingRatio: number;
}

export class AlphaNetwork {
  private readonly _nodes = new Map<string, AlphaNode>();
  /** field → node keys touching that field. */
  private readonly _fieldIndex = new Map<string, string[]>();
  private readonly _rules: CompiledRule[] = [];
  private _lastLeafEvaluations = 0;
  private _naiveLeafEvaluations = 0;

  /**
   * Compile a rule set into the shared network. Replaces any previous
   * compilation. Rules with identical leaf sets share every alpha node.
   */
  compile(rules: ReadonlyArray<VersionedRule>): void {
    this._nodes.clear();
    this._fieldIndex.clear();
    this._rules.length = 0;
    this._naiveLeafEvaluations = 0;

    const intern = (leaf: LeafCondition): AlphaNode => {
      const key = leafKey(leaf);
      let node = this._nodes.get(key);
      if (!node) {
        node = { key, leaf, lastResult: false, evaluations: 0 };
        this._nodes.set(key, node);
        const idx = this._fieldIndex.get(leaf.field) ?? [];
        idx.push(key);
        this._fieldIndex.set(leaf.field, idx);
      }
      return node;
    };

    for (const rule of rules) {
      const { leaves, residual } = splitCondition(rule.condition);
      this._rules.push({ rule, alphaNodes: leaves.map(intern), residual });
      // Naive cost = all leaves in the full tree.
      this._naiveLeafEvaluations += countLeaves(rule.condition);
    }
  }

  /**
   * Evaluate the network against a fact. Alpha nodes run once each
   * (skipped entirely when their field is absent and the op isn't
   * 'notExists'); a rule activates when every shared leaf passes AND its
   * residual (if any) evaluates true.
   */
  match(facts: Record<string, unknown>): ReadonlyArray<VersionedRule> {
    this._lastLeafEvaluations = 0;

    // Determine which alpha nodes are relevant: field present → evaluate;
    // field absent → result is false unless op is 'notExists'.
    const relevant = new Set<string>();
    for (const node of this._nodes.values()) {
      const { found } = resolvePath(facts, node.leaf.field);
      if (found || node.leaf.op === 'notExists' || node.leaf.op === 'exists') {
        relevant.add(node.key);
        node.lastResult = evaluateLeafSafe(node.leaf, facts);
        node.evaluations++;
        this._lastLeafEvaluations++;
      } else {
        node.lastResult = false; // absent field — every other op fails
      }
    }

    const activated: VersionedRule[] = [];
    for (const cr of this._rules) {
      if (!cr.alphaNodes.every((n) => n.lastResult)) continue;
      if (cr.residual && !evaluateCondition(cr.residual, facts)) continue;
      activated.push(cr.rule);
    }
    return activated;
  }

  /** All alpha nodes (for inspection/testing). */
  nodes(): ReadonlyArray<{ key: string; leaf: LeafCondition; evaluations: number }> {
    return [...this._nodes.values()];
  }

  stats(): AlphaNetworkStats {
    return {
      alphaNodes: this._nodes.size,
      rules: this._rules.length,
      lastLeafEvaluations: this._lastLeafEvaluations,
      naiveLeafEvaluations: this._naiveLeafEvaluations,
      sharingRatio:
        this._lastLeafEvaluations === 0
          ? 1
          : this._naiveLeafEvaluations / this._lastLeafEvaluations,
    };
  }
}

function countLeaves(c: Condition): number {
  if (c.kind === 'leaf') return 1;
  return c.children.reduce((a, ch) => a + countLeaves(ch), 0);
}

function evaluateLeafSafe(leaf: LeafCondition, facts: Record<string, unknown>): boolean {
  return evaluateCondition(leaf, facts);
}
