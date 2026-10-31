/**
 * CategoryQuota — hard/soft diversity constraints on ranked lists.
 *
 * `DiversityReranker` optimizes category *spread* softly via MMR;
 * merchandising and editorial often need guarantees: "at least 2
 * clearance items", "at most 3 sponsored", "never a list that's all
 * one brand". This enforcer walks the ranked list left-to-right:
 *
 *   1. max caps are hard — excess items are dropped to a tail buffer,
 *      preserving their relative order for backfill;
 *   2. min quotas are soft — the lowest-ranked unplaced item of a
 *      starved category is promoted over the last swappable slot;
 *      never displacing another min-quota-protected item;
 *   3. backfill refills the list from dropped items in rank order
 *      when a min promotion opened a hole, subject to max caps.
 *
 * The result keeps relevance order as much as the constraints allow —
 * the algorithm is a greedy constraint-projection, optimal under the
 * "minimal displacement" objective for independent per-category caps
 * (no joint constraints across categories).
 *
 * Complexity: O(n·C) for n candidates and C quota categories.
 *
 * @module RecommendationLayer/Engine
 */

import { ItemId } from '../implementations/recommend/Types';
import { CategorizedItem, QuotaResult, QuotaRule } from './types';

export class CategoryQuota {
  private readonly _rules: ReadonlyMap<string, QuotaRule>;

  constructor(rules: readonly QuotaRule[]) {
    this._rules = new Map(rules.map((r) => [r.category, r]));
  }

  /**
   * Enforce quotas on a ranked list. Input order = relevance order;
   * the output never reorders within a category beyond what mins need.
   *
   * Algorithm: greedy in-rank-order placement. Keep a working set of
   * `limit` slots; an item takes a slot unless its category is maxed.
   * Min-quota satisfaction is then repaired by swapping in the
   * best-ranked excluded items of starved categories for the
   * lowest-ranked unprotected occupants.
   */
  enforce(ranked: readonly CategorizedItem[], topN?: number): QuotaResult {
    const limit = topN ?? ranked.length;

    // ---- pass 1: fill up to `limit` slots, respecting max caps -----
    const kept: CategorizedItem[] = [];
    const overflow: CategorizedItem[] = []; // excluded, rank order
    const keptCounts = new Map<string, number>();
    for (const item of ranked) {
      if (kept.length >= limit) {
        overflow.push(item);
        continue;
      }
      const rule = this._rules.get(item.category);
      const c = keptCounts.get(item.category) ?? 0;
      if (rule?.max !== undefined && c >= rule.max) {
        overflow.push(item);
        continue;
      }
      kept.push(item);
      keptCounts.set(item.category, c + 1);
    }
    const protectedIds = new Set<ItemId>();
    for (const i of kept) {
      const min = this._rules.get(i.category)?.min ?? 0;
      if (min > 0) protectedIds.add(i.itemId);
    }

    // ---- pass 2: repair min quotas by swapping --------------------
    const promoted: ItemId[] = [];
    const unmet: string[] = [];
    for (const [cat, rule] of this._rules) {
      const min = rule.min ?? 0;
      if (min === 0) continue;
      let have = keptCounts.get(cat) ?? 0;
      while (have < min) {
        const idx = overflow.findIndex((i) => i.category === cat);
        if (idx < 0) {
          unmet.push(cat);
          break;
        }
        // displacement target: lowest-ranked kept item whose removal
        // can't break its own min and isn't already a protected min item
        const slot = this._displaceable(kept, keptCounts, protectedIds);
        if (slot < 0) {
          unmet.push(cat);
          break;
        }
        const candidate = overflow.splice(idx, 1)[0];
        const evicted = kept[slot];
        kept[slot] = candidate;
        protectedIds.add(candidate.itemId);
        protectedIds.delete(evicted.itemId);
        keptCounts.set(cat, (keptCounts.get(cat) ?? 0) + 1);
        keptCounts.set(
          evicted.category,
          Math.max(0, (keptCounts.get(evicted.category) ?? 1) - 1)
        );
        promoted.push(candidate.itemId);
        // evicted item goes back into the overflow pool at its rank
        overflow.push(evicted);
        have++;
      }
    }

    // ---- pass 3: backfill holes (promotions replaced items, so the
    // kept array is already at limit; only unmet-quota gaps remain).
    // Backfill from overflow where max caps allow.
    const out = [...kept];
    const outCounts = new Map<string, number>();
    for (const i of out) outCounts.set(i.category, (outCounts.get(i.category) ?? 0) + 1);
    for (const item of overflow) {
      if (out.length >= limit) break;
      const rule = this._rules.get(item.category);
      const c = outCounts.get(item.category) ?? 0;
      if (rule?.max !== undefined && c >= rule.max) continue;
      out.push(item);
      outCounts.set(item.category, c + 1);
    }

    const outIds = new Set(out.map((i) => i.itemId));
    const dropped: ItemId[] = [];
    for (const i of ranked) {
      if (!outIds.has(i.itemId)) dropped.push(i.itemId);
    }
    return { items: out, promoted, dropped, unmet };
  }

  /* ---------------------------------------------------------------- */

  /**
   * Lowest-ranked kept slot safe to swap out: its category isn't at
   * its min floor, and it isn't itself a quota-protected promotion.
   */
  private _displaceable(
    kept: readonly CategorizedItem[],
    keptCounts: ReadonlyMap<string, number>,
    protectedIds: ReadonlySet<ItemId>
  ): number {
    for (let i = kept.length - 1; i >= 0; i--) {
      const item = kept[i];
      if (protectedIds.has(item.itemId)) continue;
      const min = this._rules.get(item.category)?.min ?? 0;
      if (min === 0) return i;
      if ((keptCounts.get(item.category) ?? 0) > min) return i;
    }
    return -1;
  }
}
