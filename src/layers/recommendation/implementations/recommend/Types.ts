/**
 * Types
 *
 * Shared data model for the recommendation engine: a user-item rating
 * matrix stored sparsely, plus recommender interfaces.
 */

export type UserId = string;
export type ItemId = string;

export interface Rating {
  readonly userId: UserId;
  readonly itemId: ItemId;
  /** explicit rating, e.g. 1..5 */
  readonly value: number;
  readonly timestamp?: number;
}

/** Sparse user-item matrix. */
export class RatingMatrix {
  /** userId -> itemId -> rating */
  private readonly byUser: Map<UserId, Map<ItemId, number>>;
  /** itemId -> userId -> rating */
  private readonly byItem: Map<ItemId, Map<UserId, number>>;
  private ratingCount: number;

  constructor(ratings: readonly Rating[] = []) {
    this.byUser = new Map();
    this.byItem = new Map();
    this.ratingCount = 0;
    for (const r of ratings) this.add(r);
  }

  add(rating: Rating): void {
    let userRow = this.byUser.get(rating.userId);
    if (userRow === undefined) {
      userRow = new Map();
      this.byUser.set(rating.userId, userRow);
    }
    let itemCol = this.byItem.get(rating.itemId);
    if (itemCol === undefined) {
      itemCol = new Map();
      this.byItem.set(rating.itemId, itemCol);
    }
    const isNew = !userRow.has(rating.itemId);
    userRow.set(rating.itemId, rating.value);
    itemCol.set(rating.userId, rating.value);
    if (isNew) this.ratingCount++;
  }

  rating(userId: UserId, itemId: ItemId): number | undefined {
    return this.byUser.get(userId)?.get(itemId);
  }

  userRatings(userId: UserId): ReadonlyMap<ItemId, number> {
    return this.byUser.get(userId) ?? new Map();
  }

  itemRatings(itemId: ItemId): ReadonlyMap<UserId, number> {
    return this.byItem.get(itemId) ?? new Map();
  }

  users(): UserId[] {
    return [...this.byUser.keys()];
  }

  items(): ItemId[] {
    return [...this.byItem.keys()];
  }

  userCount(): number {
    return this.byUser.size;
  }

  itemCount(): number {
    return this.byItem.size;
  }

  size(): number {
    return this.ratingCount;
  }

  mean(): number {
    if (this.ratingCount === 0) return 0;
    let sum = 0;
    for (const row of this.byUser.values()) {
      for (const v of row.values()) sum += v;
    }
    return sum / this.ratingCount;
  }

  userMean(userId: UserId): number {
    const row = this.byUser.get(userId);
    if (row === undefined || row.size === 0) return 0;
    let sum = 0;
    for (const v of row.values()) sum += v;
    return sum / row.size;
  }

  itemMean(itemId: ItemId): number {
    const col = this.byItem.get(itemId);
    if (col === undefined || col.size === 0) return 0;
    let sum = 0;
    for (const v of col.values()) sum += v;
    return sum / col.size;
  }

  /** Items the user has NOT rated. */
  unratedItems(userId: UserId): ItemId[] {
    const rated = this.byUser.get(userId);
    const out: ItemId[] = [];
    for (const itemId of this.byItem.keys()) {
      if (rated === undefined || !rated.has(itemId)) out.push(itemId);
    }
    return out;
  }
}

export interface ScoredItem {
  readonly itemId: ItemId;
  readonly score: number;
  readonly reason?: string;
}

export interface RecommendOptions {
  /** max results */
  readonly topN?: number;
  /** items to exclude (e.g. already consumed) */
  readonly exclude?: ReadonlySet<ItemId>;
  /** minimum score to include */
  readonly minScore?: number;
}

/** Every recommender implements this contract. */
export interface IRecommender {
  readonly name: string;
  /** Score a candidate item for a user. Higher = better. */
  score(userId: UserId, itemId: ItemId): number;
  /** Rank items for a user. Default implementation scores all candidates. */
  recommend(userId: UserId, options?: RecommendOptions): ScoredItem[];
}

/** Shared default recommend() over all items. */
export function defaultRecommend(
  recommender: IRecommender,
  matrix: RatingMatrix,
  userId: UserId,
  options: RecommendOptions = {}
): ScoredItem[] {
  const topN = options.topN ?? 10;
  const minScore = options.minScore ?? -Infinity;
  const exclude = options.exclude;
  const out: ScoredItem[] = [];
  for (const itemId of matrix.unratedItems(userId)) {
    if (exclude !== undefined && exclude.has(itemId)) continue;
    const score = recommender.score(userId, itemId);
    if (score < minScore || Number.isNaN(score)) continue;
    out.push({ itemId, score });
  }
  out.sort((a, b) => b.score - a.score || a.itemId.localeCompare(b.itemId));
  return out.slice(0, topN);
}
