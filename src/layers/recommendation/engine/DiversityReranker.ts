/**
 * DiversityReranker — category-spread re-ranking.
 *
 * A pure relevance ranking collapses onto the user's dominant
 * category (all sci-fi, all pop music). The standard fix is
 * MMR-flavored re-ranking:
 *
 *   next = argmax_i [ λ·relevance_i − (1−λ)·penalty_i ]
 *   penalty_i = same-category count already selected
 *             (optionally normalized by max count seen)
 *
 * The greedy pass is O(candidates × selected) — cheap at UI list
 * sizes. On top of the soft penalty there's an optional hard
 * `maxPerCategory` cap (strict quotas, e.g. "at most 2 sponsored
 * items").
 *
 * Categories are attached upstream (`CategorizedItem`) — the engine
 * stays agnostic to taxonomy granularity: top-level genre, aisle,
 * or embedding-cluster label all work identically.
 *
 * @module RecommendationLayer/Engine
 */

import {
  CategorizedItem,
  DiversityOptions,
} from './types';

export class DiversityReranker {
  private readonly _lambda: number;
  private readonly _maxPerCategory: number;
  private readonly _topN: number;

  constructor(options: DiversityOptions = {}) {
    this._lambda = options.lambda ?? 0.7;
    this._maxPerCategory = options.maxPerCategory ?? 0;
    this._topN = options.topN ?? 10;
    if (this._lambda < 0 || this._lambda > 1) {
      throw new RangeError('lambda must be in [0,1]');
    }
  }

  /**
   * Greedy MMR selection. Input need not be pre-sorted — relevance
   * comes from `item.score`.
   *
   * The penalty uses the *fraction* of selected items sharing the
   * candidate's category (0..1), which makes λ interpretable across
   * list sizes.
   */
  rerank(items: readonly CategorizedItem[], topN?: number): CategorizedItem[] {
    const limit = topN ?? this._topN;
    const pool = [...items];
    const selected: CategorizedItem[] = [];
    const categoryCounts = new Map<string, number>();

    while (pool.length > 0 && selected.length < limit) {
      let bestIdx = -1;
      let bestScore = -Infinity;

      for (let i = 0; i < pool.length; i++) {
        const cand = pool[i];
        const sameCat = categoryCounts.get(cand.category) ?? 0;
        if (
          this._maxPerCategory > 0 &&
          sameCat >= this._maxPerCategory
        ) {
          continue; // hard quota — never eligible
        }
        const share = selected.length > 0 ? sameCat / selected.length : 0;
        const score =
          this._lambda * cand.score - (1 - this._lambda) * share;
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }

      if (bestIdx < 0) {
        // Everything left is capped — fill remaining slots by raw
        // score so the list still reaches `limit`.
        pool.sort((a, b) => b.score - a.score);
        for (const item of pool) {
          if (selected.length >= limit) break;
          selected.push(item);
          categoryCounts.set(
            item.category,
            (categoryCounts.get(item.category) ?? 0) + 1
          );
        }
        break;
      }

      const [pick] = pool.splice(bestIdx, 1);
      selected.push(pick);
      categoryCounts.set(
        pick.category,
        (categoryCounts.get(pick.category) ?? 0) + 1
      );
    }
    return selected;
  }

  /**
   * Intra-list diversity of an existing ranking: 1 − max category
   * share. 1 = perfectly mixed, 0 = monoculture. A diagnostic for
   * comparing rankings before/after.
   */
  diversityOf(items: readonly CategorizedItem[]): number {
    if (items.length === 0) return 0;
    const counts = new Map<string, number>();
    let max = 0;
    for (const item of items) {
      const c = (counts.get(item.category) ?? 0) + 1;
      counts.set(item.category, c);
      if (c > max) max = c;
    }
    return 1 - max / items.length;
  }
}
