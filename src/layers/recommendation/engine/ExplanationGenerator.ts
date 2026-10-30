/**
 * ExplanationGenerator — "because you liked X" rationales.
 *
 * Explanations are a first-class output of production recommenders
 * (Netflix's "Because you watched…"): they measurably raise CTR and
 * trust. The engine derives them from the same evidence the model
 * used:
 *
 *  - `similar-items`  — item-item collaborative evidence: the
 *     candidate's nearest neighbors in item space that the user
 *     already rated highly. "Because you liked Dune, Foundation."
 *
 *  - `similar-users`  — user-user evidence: neighbors of the user
 *     who loved this item. "Popular with users like you."
 *
 *  - `category-affinity` — the item's dominant category is one of
 *     the user's top categories. "Matches your interest in sci-fi."
 *
 *  - `trending`       — popularity fallback when no personal
 *     evidence exists. "Trending now."
 *
 * Neighbors are computed from a sparse rating matrix with cosine
 * similarity over co-raters — the same math the layer's
 * `Similarity.ts` uses, kept inline here so explanations carry
 * their own evidence without coupling to a recommender instance.
 *
 * Complexity: O(items × co-raters) neighbor build (cached); O(1)
 * per explanation after.
 *
 * @module RecommendationLayer/Engine
 */

import {
  Explanation,
  ExplanationKind,
} from './types';
import {
  ItemId,
  RatingMatrix,
  UserId,
} from '../implementations/recommend/Types';

export interface ExplanationOptions {
  /** item neighbors retained for evidence. Default 20. */
  readonly neighbors?: number;
  /** minimum cosine similarity to count as evidence. Default 0.1. */
  readonly minSimilarity?: number;
  /** minimum user rating that counts as "liked". Default 4. */
  readonly likedThreshold?: number;
  /** max evidence items cited in the text. Default 2. */
  readonly maxEvidence?: number;
}

export class ExplanationGenerator {
  private readonly _matrix: RatingMatrix;
  private readonly _neighbors: number;
  private readonly _minSim: number;
  private readonly _likedThreshold: number;
  private readonly _maxEvidence: number;

  /** itemId → sorted neighbor list (lazy, memoized). */
  private readonly _neighborCache: Map<ItemId, Array<{ itemId: ItemId; sim: number }>>;

  constructor(matrix: RatingMatrix, options: ExplanationOptions = {}) {
    this._matrix = matrix;
    this._neighbors = options.neighbors ?? 20;
    this._minSim = options.minSimilarity ?? 0.1;
    this._likedThreshold = options.likedThreshold ?? 4;
    this._maxEvidence = options.maxEvidence ?? 2;
    this._neighborCache = new Map();
  }

  /**
   * Explain why `itemId` was recommended to `userId`. Picks the
   * strongest available evidence kind in order: similar-items →
   * similar-users → category-affinity → trending.
   */
  explain(userId: UserId, itemId: ItemId, categories?: ReadonlyMap<ItemId, string>): Explanation {
    const personal = this._similarItems(userId, itemId);
    if (personal !== null) return personal;

    const social = this._similarUsers(userId, itemId);
    if (social !== null) return social;

    if (categories !== undefined) {
      const affinity = this._categoryAffinity(userId, itemId, categories);
      if (affinity !== null) return affinity;
    }

    return {
      itemId,
      kind: 'trending',
      text: 'Trending now',
      evidence: [],
      confidence: 0.1,
    };
  }

  /** Explanations for a whole ranked list. */
  explainAll(
    userId: UserId,
    itemIds: readonly ItemId[],
    categories?: ReadonlyMap<ItemId, string>
  ): Explanation[] {
    return itemIds.map((id) => this.explain(userId, id, categories));
  }

  /* ---------------------------------------------------------------- */
  /* Evidence kinds                                                     */
  /* ---------------------------------------------------------------- */

  /**
   * Items the user liked that are neighbors of the candidate —
   * the strongest and most legible rationale.
   */
  private _similarItems(userId: UserId, itemId: ItemId): Explanation | null {
    const neighbors = this._itemNeighbors(itemId);
    if (neighbors.length === 0) return null;

    const liked = new Set<ItemId>();
    for (const [iid, v] of this._matrix.userRatings(userId)) {
      if (v >= this._likedThreshold) liked.add(iid);
    }
    if (liked.size === 0) return null;

    const evidence = neighbors
      .filter((n) => liked.has(n.itemId))
      .slice(0, this._maxEvidence);
    if (evidence.length === 0) return null;

    const names = evidence.map((e) => e.itemId).join(', ');
    const best = evidence[0].sim;
    return {
      itemId,
      kind: 'similar-items',
      text: `Because you liked ${names}`,
      evidence: evidence.map((e) => e.itemId),
      confidence: Math.min(1, best + 0.3 * evidence.length),
    };
  }

  /** Users similar to this one who loved the item. */
  private _similarUsers(userId: UserId, itemId: ItemId): Explanation | null {
    const itemRaters = this._matrix.itemRatings(itemId);
    if (itemRaters.size === 0) return null;

    // Cheap user-similarity proxy: co-rated items overlap.
    const myRatings = this._matrix.userRatings(userId);
    if (myRatings.size === 0) return null;

    let supporters = 0;
    let strongest = 0;
    for (const [other, value] of itemRaters) {
      if (other === userId) continue;
      if (value < this._likedThreshold) continue;
      const theirs = this._matrix.userRatings(other);
      const overlap = intersectionSize(myRatings, theirs);
      if (overlap >= 2) {
        supporters++;
        strongest = Math.max(strongest, value);
      }
    }
    if (supporters === 0) return null;

    return {
      itemId,
      kind: 'similar-users',
      text: 'Popular with users who share your taste',
      evidence: [],
      confidence: Math.min(1, 0.2 + 0.15 * supporters),
    };
  }

  /** Item's category is in the user's top categories. */
  private _categoryAffinity(
    userId: UserId,
    itemId: ItemId,
    categories: ReadonlyMap<ItemId, string>
  ): Explanation | null {
    const cat = categories.get(itemId);
    if (cat === undefined) return null;

    const counts = new Map<string, number>();
    for (const [iid] of this._matrix.userRatings(userId)) {
      const c = categories.get(iid);
      if (c !== undefined) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    if (counts.size === 0) return null;
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const rank = top.findIndex(([c]) => c === cat);
    if (rank < 0 || rank > 2) return null;

    return {
      itemId,
      kind: 'category-affinity',
      text: `Matches your interest in ${cat}`,
      evidence: [],
      confidence: Math.min(1, 0.4 + 0.2 * (2 - rank)),
    };
  }

  /* ---------------------------------------------------------------- */
  /* Item neighbors                                                     */
  /* ---------------------------------------------------------------- */

  /**
   * k nearest items by cosine similarity over co-raters, memoized.
   * Built lazily per queried item — O(items × raters) worst case.
   */
  private _itemNeighbors(itemId: ItemId): Array<{ itemId: ItemId; sim: number }> {
    const cached = this._neighborCache.get(itemId);
    if (cached !== undefined) return cached;

    const mine = this._matrix.itemRatings(itemId);
    const out: Array<{ itemId: ItemId; sim: number }> = [];
    for (const other of this._matrix.items()) {
      if (other === itemId) continue;
      const theirs = this._matrix.itemRatings(other);
      const sim = cosine(mine, theirs);
      if (sim >= this._minSim) out.push({ itemId: other, sim });
    }
    out.sort((a, b) => b.sim - a.sim);
    const top = out.slice(0, this._neighbors);
    this._neighborCache.set(itemId, top);
    return top;
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

/** Cosine similarity over the intersection of two sparse vectors. */
function cosine(
  a: ReadonlyMap<string, number>,
  b: ReadonlyMap<string, number>
): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const [k, va] of small) {
    const vb = big.get(k);
    if (vb !== undefined) dot += va * vb;
  }
  for (const v of a.values()) na += v * v;
  for (const v of b.values()) nb += v * v;
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

function intersectionSize(
  a: ReadonlyMap<string, number>,
  b: ReadonlyMap<string, number>
): number {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let n = 0;
  for (const k of small.keys()) if (big.has(k)) n++;
  return n;
}
