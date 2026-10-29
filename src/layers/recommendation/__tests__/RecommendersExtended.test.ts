import { describe, it, expect } from 'bun:test';
import { RatingMatrix } from '../implementations/recommend/Types';
import {
  CooccurrenceRecommender,
  SequentialRecommender,
  ImplicitALS,
  solveLinearSystem,
} from '../implementations/implicit/ImplicitCF';
import {
  trainTestSplit,
  ratingError,
  rankingMetrics,
  catalogCoverage,
  looHitRate,
} from '../implementations/evaluation/Metrics';
import { ItemBasedCF } from '../implementations/recommend/CollaborativeFiltering';

function sampleMatrix(): RatingMatrix {
  const ratings: Array<{ userId: string; itemId: string; value: number }> = [];
  // 6 users, overlapping item preferences
  const pairs: Array<[string, string, number]> = [
    ['u1', 'a', 5], ['u1', 'b', 4], ['u1', 'c', 4], ['u1', 'x', 1],
    ['u2', 'a', 4], ['u2', 'b', 5], ['u2', 'c', 4], ['u2', 'x', 1],
    ['u3', 'a', 5], ['u3', 'b', 3], ['u3', 'c', 5],
    ['u4', 'x', 5], ['u4', 'y', 4], ['u4', 'z', 4], ['u4', 'a', 1],
    ['u5', 'x', 4], ['u5', 'y', 5], ['u5', 'z', 3], ['u5', 'b', 1],
    ['u6', 'x', 5], ['u6', 'y', 4], ['u6', 'z', 5],
  ];
  for (const [userId, itemId, value] of pairs) ratings.push({ userId, itemId, value });
  return new RatingMatrix(ratings);
}

describe('CooccurrenceRecommender', () => {
  it('counts co-occurrences', () => {
    const m = sampleMatrix();
    const co = new CooccurrenceRecommender(m);
    expect(co.cooccurrence('a', 'b')).toBe(3);
    // u4 rated both 'a' and 'z'
    expect(co.cooccurrence('a', 'z')).toBe(1);
    expect(co.cooccurrence('c', 'z')).toBe(0);
    expect(co.itemSimilarity('a', 'b')).toBeGreaterThan(0);
  });

  it('recommends co-occurring items', () => {
    const m = sampleMatrix();
    const co = new CooccurrenceRecommender(m);
    const recs = co.recommend('u6'); // u6 has x,y,z — should get a,b less; y/z rated
    for (const r of recs) {
      expect(m.userRatings('u6').has(r.itemId)).toBe(false);
    }
  });
});

describe('SequentialRecommender', () => {
  it('learns transitions and predicts next items', () => {
    const m = sampleMatrix();
    const seq = new SequentialRecommender(m, [
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
      ['a', 'b', 'd'],
    ]);
    expect(seq.transitionProbability('a', 'b')).toBe(1);
    const next = seq.recommendNext('b');
    expect(next[0].itemId).toBe('c');
  });
});

describe('ImplicitALS', () => {
  it('solveLinearSystem works', () => {
    // 2x + y = 5; x + 3y = 10  => x=1, y=3
    const A = new Float64Array([2, 1, 1, 3]);
    const b = new Float64Array([5, 10]);
    const x = new Float64Array(2);
    solveLinearSystem(A, b, x, 2);
    expect(x[0]).toBeCloseTo(1);
    expect(x[1]).toBeCloseTo(3);
  });

  it('trains and produces finite scores', () => {
    const m = sampleMatrix();
    const als = new ImplicitALS(m, { factors: 4, iterations: 5, seed: 1 });
    als.train();
    const recs = als.recommend('u1', { topN: 3 });
    expect(recs.length).toBeGreaterThan(0);
    for (const r of recs) expect(Number.isFinite(r.score)).toBe(true);
  });
});

describe('Metrics', () => {
  it('trainTestSplit holds out test items', () => {
    const m = sampleMatrix();
    const { train, test } = trainTestSplit(m, 0.25, 2);
    expect(test.size()).toBeGreaterThan(0);
    expect(train.size() + test.size()).toBe(m.size());
  });

  it('ratingError computes rmse', () => {
    const m = sampleMatrix();
    const { train, test } = trainTestSplit(m, 0.25);
    const cf = new ItemBasedCF(train);
    const { rmse, count } = ratingError(cf, test);
    expect(count).toBeGreaterThan(0);
    expect(rmse).toBeGreaterThanOrEqual(0);
    expect(rmse).toBeLessThan(5);
  });

  it('rankingMetrics returns bounded metrics', () => {
    const m = sampleMatrix();
    const { train, test } = trainTestSplit(m, 0.25);
    const cf = new ItemBasedCF(train);
    const metrics = rankingMetrics(cf, test, 5, 3);
    for (const v of [metrics.precision, metrics.recall, metrics.map, metrics.ndcg, metrics.hitRate]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('catalogCoverage in [0,1]', () => {
    const m = sampleMatrix();
    const cf = new ItemBasedCF(m);
    const cov = catalogCoverage(cf, m, 5);
    expect(cov).toBeGreaterThanOrEqual(0);
    expect(cov).toBeLessThanOrEqual(1);
  });

  it('looHitRate computes hit rate', () => {
    const m = sampleMatrix();
    const hr = looHitRate(m, (train) => new ItemBasedCF(train), 5, 3);
    expect(hr).toBeGreaterThanOrEqual(0);
    expect(hr).toBeLessThanOrEqual(1);
  });
});
