/**
 * CandidateSelector — pick the best-matching candidate under a spec.
 *
 * Selection modes:
 *   - `selectAll` — strict filtering: candidates where `isSatisfiedBy`
 *     returns true.
 *   - `bestMatch` — soft scoring: each leaf in the criteria tree votes;
 *     the score is the fraction of satisfied conjunctive leaves. A
 *     candidate can "best match" without fully satisfying the spec —
 *     the classic use case ("find the closest eligible user").
 *
 * Scoring model: the tree is normalized so only AND-structure
 * contributes fractional credit — under OR the best-scoring branch is
 * taken (a candidate needn't satisfy every alternative), and NOT
 * inverts its child's score. This mirrors fuzzy-logic AND/OR/NOT
 * semantics over per-leaf truth values.
 *
 * @module Specification/Engines
 */

import { evalLeaf } from './Specification';
import {
  CandidateScore,
  ISpecification,
  LeafVerdict,
  SpecNode,
} from './types';

type Row = Record<string, unknown>;

export class CandidateSelector<T = Row> {
  private readonly _spec: ISpecification<T>;

  constructor(spec: ISpecification<T>) {
    this._spec = spec;
  }

  /** All candidates that fully satisfy the spec (stable order). */
  selectAll(candidates: readonly T[]): T[] {
    return candidates.filter((c) => this._spec.isSatisfiedBy(c));
  }

  /**
   * Score every candidate; returns entries sorted by score desc,
   * original index asc as tiebreak. `score` is fuzzy membership in
   * [0,1] — see module doc for the semantics.
   */
  scoreAll(candidates: readonly T[]): CandidateScore<T>[] {
    const node = this._spec.toNode();
    const scored = candidates.map((candidate, idx) => {
      const detail: LeafVerdict[] = [];
      const score = this._score(node, candidate, detail);
      return { candidate, score, detail, idx };
    });
    scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
    return scored.map(({ candidate, score, detail }) => ({ candidate, score, detail }));
  }

  /**
   * The single best-matching candidate, or null for an empty list.
   * `minScore` rejects best matches below the threshold (default 0 —
   * always returns something non-empty input).
   */
  bestMatch(candidates: readonly T[], minScore = 0): CandidateScore<T> | null {
    const scored = this.scoreAll(candidates);
    const top = scored[0];
    if (top === undefined || top.score < minScore) return null;
    return top;
  }

  /**
   * Fuzzy membership evaluation over the criteria tree:
   *   AND — mean of children (partial credit)
   *   OR  — max of children (best alternative wins)
   *   NOT — 1 - child
   *   leaf — 1 or 0, recorded in `detail`
   */
  private _score(node: SpecNode, candidate: T, detail: LeafVerdict[]): number {
    switch (node.kind) {
      case 'leaf': {
        let ok = false;
        try {
          ok = evalLeaf(node, candidate);
        } catch {
          ok = false;
        }
        detail.push({ spec: `${node.field} ${node.op}`, satisfied: ok });
        return ok ? 1 : 0;
      }
      case 'logic': {
        if (node.children.length === 0) return node.op === 'and' ? 1 : 0;
        const scores = node.children.map((c) => this._score(c, candidate, detail));
        if (node.op === 'and') {
          return scores.reduce((a, s) => a + s, 0) / scores.length;
        }
        return Math.max(...scores);
      }
      case 'not': {
        return 1 - this._score(node.child, candidate, detail);
      }
      case 'custom': {
        // Opaque node: fall back to the spec's boolean verdict as a
        // 0/1 score for the whole subtree.
        const ok = this._spec.isSatisfiedBy(candidate);
        detail.push({ spec: `custom(${node.spec})`, satisfied: ok });
        return ok ? 1 : 0;
      }
    }
  }
}
