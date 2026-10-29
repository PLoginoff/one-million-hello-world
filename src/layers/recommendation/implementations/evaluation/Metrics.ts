/**
 * Metrics
 *
 * Offline evaluation for recommenders: rating-prediction error (RMSE/MAE)
 * and ranking quality (precision@k, recall@k, MAP, NDCG, hit rate,
 * catalog coverage).
 */

import { RatingMatrix, IRecommender, ScoredItem, UserId, ItemId } from '../recommend/Types';

export interface EvalSplit {
  readonly train: RatingMatrix;
  readonly test: RatingMatrix;
}

/** Deterministic hold-out split: per-user last `testRatio` of ratings. */
export function trainTestSplit(
  matrix: RatingMatrix,
  testRatio = 0.2,
  minRatings = 2
): EvalSplit {
  const train: Array<{ userId: UserId; itemId: ItemId; value: number }> = [];
  const test: Array<{ userId: UserId; itemId: ItemId; value: number }> = [];
  for (const u of matrix.users()) {
    const ratings = [...matrix.userRatings(u).entries()];
    if (ratings.length < minRatings) {
      for (const [itemId, value] of ratings) train.push({ userId: u, itemId, value });
      continue;
    }
    const nTest = Math.max(1, Math.floor(ratings.length * testRatio));
    // deterministic: last nTest items (insertion order)
    const testItems = ratings.slice(ratings.length - nTest);
    const trainItems = ratings.slice(0, ratings.length - nTest);
    for (const [itemId, value] of trainItems) train.push({ userId: u, itemId, value });
    for (const [itemId, value] of testItems) test.push({ userId: u, itemId, value });
  }
  return { train: new RatingMatrix(train), test: new RatingMatrix(test) };
}

/** RMSE/MAE of predicted vs actual ratings on a test matrix. */
export function ratingError(
  recommender: IRecommender,
  test: RatingMatrix
): { rmse: number; mae: number; count: number } {
  let se = 0;
  let ae = 0;
  let n = 0;
  for (const u of test.users()) {
    for (const [itemId, actual] of test.userRatings(u)) {
      const pred = recommender.score(u, itemId);
      if (!Number.isFinite(pred)) continue;
      const e = actual - pred;
      se += e * e;
      ae += Math.abs(e);
      n++;
    }
  }
  return { rmse: n > 0 ? Math.sqrt(se / n) : 0, mae: n > 0 ? ae / n : 0, count: n };
}

export interface RankingMetrics {
  readonly precision: number;
  readonly recall: number;
  readonly map: number;
  readonly ndcg: number;
  readonly hitRate: number;
  readonly usersEvaluated: number;
}

/**
 * Ranking metrics @k: relevant items = test ratings >= relevanceThreshold.
 */
export function rankingMetrics(
  recommender: IRecommender,
  test: RatingMatrix,
  k = 10,
  relevanceThreshold = 4
): RankingMetrics {
  let sumP = 0;
  let sumR = 0;
  let sumAP = 0;
  let sumNdcg = 0;
  let hits = 0;
  let evaluated = 0;
  for (const u of test.users()) {
    const relevant = new Set<ItemId>();
    let maxDcg = 0;
    const relList: number[] = [];
    for (const [itemId, rating] of test.userRatings(u)) {
      if (rating >= relevanceThreshold) {
        relevant.add(itemId);
        relList.push(rating);
      }
    }
    if (relevant.size === 0) continue;
    evaluated++;
    relList.sort((a, b) => b - a);
    for (let i = 0; i < Math.min(k, relList.length); i++) {
      maxDcg += (Math.pow(2, relList[i]) - 1) / Math.log2(i + 2);
    }
    const recs = recommender.recommend(u, { topN: k });
    let tp = 0;
    let apSum = 0;
    let dcg = 0;
    for (let i = 0; i < recs.length; i++) {
      const item = recs[i].itemId;
      const rating = test.userRatings(u).get(item) ?? 0;
      if (relevant.has(item)) {
        tp++;
        apSum += tp / (i + 1);
        dcg += (Math.pow(2, rating) - 1) / Math.log2(i + 2);
      }
    }
    sumP += tp / Math.max(1, recs.length);
    sumR += tp / relevant.size;
    sumAP += tp > 0 ? apSum / relevant.size : 0;
    sumNdcg += maxDcg > 0 ? dcg / maxDcg : 0;
    if (tp > 0) hits++;
  }
  const n = Math.max(1, evaluated);
  return {
    precision: sumP / n,
    recall: sumR / n,
    map: sumAP / n,
    ndcg: sumNdcg / n,
    hitRate: hits / n,
    usersEvaluated: evaluated,
  };
}

/** Fraction of the catalog recommended across all users. */
export function catalogCoverage(
  recommender: IRecommender,
  matrix: RatingMatrix,
  k = 10
): number {
  const recommended = new Set<ItemId>();
  const catalog = new Set(matrix.items());
  for (const u of matrix.users()) {
    for (const r of recommender.recommend(u, { topN: k })) {
      recommended.add(r.itemId);
    }
  }
  if (catalog.size === 0) return 0;
  return recommended.size / catalog.size;
}

/**
 * Leave-one-out evaluation: for each user with >=2 ratings, hold out one
 * item and check whether it appears in top-k. Deterministic LOO via the
 * last-rated item per user.
 */
export function looHitRate(
  matrix: RatingMatrix,
  buildRecommender: (train: RatingMatrix) => IRecommender,
  k = 10,
  relevanceThreshold = 0
): number {
  const train: Array<{ userId: UserId; itemId: ItemId; value: number }> = [];
  const heldOut = new Map<UserId, ItemId>();
  for (const u of matrix.users()) {
    const ratings = [...matrix.userRatings(u).entries()];
    if (ratings.length < 2) continue;
    const [itemId, value] = ratings[ratings.length - 1];
    if (value >= relevanceThreshold) heldOut.set(u, itemId);
    for (const [i, v] of ratings.slice(0, -1)) {
      train.push({ userId: u, itemId: i, value: v });
    }
    // keep held-out item in catalog via another user's rating — it stays
    // because items() is derived from byItem across all users
  }
  const rec = buildRecommender(new RatingMatrix(train));
  let hits = 0;
  let total = 0;
  for (const [u, itemId] of heldOut) {
    total++;
    const recs: ScoredItem[] = rec.recommend(u, { topN: k });
    if (recs.some((r) => r.itemId === itemId)) hits++;
  }
  return total > 0 ? hits / total : 0;
}
