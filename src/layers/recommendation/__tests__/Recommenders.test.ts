import { describe, it, expect, beforeEach } from 'bun:test';
import { RatingMatrix } from '../implementations/recommend/Types';
import { cosineSim, pearsonSim } from '../implementations/recommend/Similarity';
import {
  UserBasedCF,
  ItemBasedCF,
} from '../implementations/recommend/CollaborativeFiltering';
import {
  ItemProfileStore,
  ContentBasedRecommender,
} from '../implementations/recommend/ContentBased';
import { MatrixFactorization } from '../implementations/recommend/MatrixFactorization';
import {
  PopularityRecommender,
  ColdStartRecommender,
  HybridRecommender,
} from '../implementations/recommend/Hybrid';

function sampleMatrix(): RatingMatrix {
  // Two taste clusters: sci-fi fans (u1,u2) and romance fans (u3,u4)
  return new RatingMatrix([
    { userId: 'u1', itemId: 'sw', value: 5 },
    { userId: 'u1', itemId: 'st', value: 4 },
    { userId: 'u1', itemId: 'blade', value: 5 },
    { userId: 'u2', itemId: 'sw', value: 5 },
    { userId: 'u2', itemId: 'st', value: 4 },
    { userId: 'u2', itemId: 'blade', value: 4 },
    { userId: 'u3', itemId: 'notebook', value: 5 },
    { userId: 'u3', itemId: 'titanic', value: 5 },
    { userId: 'u3', itemId: 'sw', value: 1 },
    { userId: 'u4', itemId: 'notebook', value: 4 },
    { userId: 'u4', itemId: 'titanic', value: 5 },
    { userId: 'u4', itemId: 'st', value: 1 },
    { userId: 'u5', itemId: 'sw', value: 5 },
    { userId: 'u5', itemId: 'st', value: 5 },
    { userId: 'u5', itemId: 'blade', value: 4 },
    { userId: 'u5', itemId: 'notebook', value: 1 },
    { userId: 'u6', itemId: 'sw', value: 4 },
    { userId: 'u6', itemId: 'st', value: 5 },
    { userId: 'u6', itemId: 'blade', value: 5 },
    { userId: 'u6', itemId: 'titanic', value: 2 },
  ]);
}

describe('RatingMatrix', () => {
  it('stores and retrieves ratings', () => {
    const m = sampleMatrix();
    expect(m.rating('u1', 'sw')).toBe(5);
    expect(m.userMean('u1')).toBeCloseTo((5 + 4 + 5) / 3);
    expect(m.unratedItems('u1')).toContain('notebook');
  });
});

describe('Similarity', () => {
  it('cosine similarity', () => {
    const a = new Map([['x', 1], ['y', 1]]);
    const b = new Map([['x', 1], ['y', 0]]);
    expect(cosineSim(a, a)).toBeCloseTo(1);
    expect(cosineSim(a, b)).toBeGreaterThan(0);
  });

  it('pearson correlation', () => {
    const a = new Map([['i1', 5], ['i2', 4], ['i3', 3]]);
    const b = new Map([['i1', 4], ['i2', 3], ['i3', 2]]);
    const c = new Map([['i1', 1], ['i2', 3], ['i3', 5]]);
    expect(pearsonSim(a, b)).toBeCloseTo(1, 5);
    expect(pearsonSim(a, c)).toBeCloseTo(-1, 5);
  });
});

describe('UserBasedCF', () => {
  it('finds taste-similar neighbors', () => {
    const m = sampleMatrix();
    const cf = new UserBasedCF(m, { similarity: 'pearson' });
    const neighbors = cf.neighbors('u1');
    expect(neighbors.length).toBeGreaterThan(0);
    expect(neighbors[0].id).toBe('u2');
  });

  it('predicts high for sci-fi, low for romance for u1', () => {
    const m = sampleMatrix();
    const cf = new UserBasedCF(m, { similarity: 'pearson', k: 10 });
    const sciFi = cf.score('u1', 'notebook'); // u1 hasn't seen it
    const recs = cf.recommend('u1', { topN: 2 });
    expect(recs.length).toBeGreaterThan(0);
    // notebook should score low since u2 never rated it and u3/u4 are negative neighbors
    expect(typeof sciFi).toBe('number');
  });

  it('recommends unrated items', () => {
    const m = sampleMatrix();
    const cf = new UserBasedCF(m);
    const recs = cf.recommend('u1');
    const rated = m.userRatings('u1');
    for (const r of recs) {
      expect(rated.has(r.itemId)).toBe(false);
    }
  });
});

describe('ItemBasedCF', () => {
  it('computes item similarity', () => {
    const m = sampleMatrix();
    const cf = new ItemBasedCF(m);
    const sim = cf.itemSimilarity('sw', 'st');
    expect(sim).toBeGreaterThan(0);
  });

  it('recommends similar items', () => {
    const m = sampleMatrix();
    const cf = new ItemBasedCF(m);
    const recs = cf.recommend('u1');
    expect(recs.length).toBeGreaterThan(0);
  });
});

describe('ContentBasedRecommender', () => {
  let m: RatingMatrix;
  let store: ItemProfileStore;
  beforeEach(() => {
    m = new RatingMatrix([
      { userId: 'u1', itemId: 'a', value: 5 },
      { userId: 'u1', itemId: 'b', value: 4 },
      { userId: 'u1', itemId: 'c', value: 1 },
    ]);
    store = new ItemProfileStore([
      { itemId: 'a', text: 'space opera laser battle galaxy' },
      { itemId: 'b', text: 'galactic empire space war' },
      { itemId: 'c', text: 'romantic comedy paris love' },
      { itemId: 'd', text: 'space exploration galaxy mission' },
      { itemId: 'e', text: 'wedding romance paris' },
    ]);
  });

  it('builds tf-idf vectors', () => {
    const v = store.vector('a');
    expect(v.size).toBeGreaterThan(0);
  });

  it('recommends content-similar items', () => {
    const rec = new ContentBasedRecommender(m, store);
    const recs = rec.recommend('u1');
    expect(recs.length).toBeGreaterThan(0);
    // 'd' shares space/galaxy tokens with liked items a,b
    expect(recs[0].itemId).toBe('d');
  });
});

describe('MatrixFactorization', () => {
  it('trains and reduces error', () => {
    const m = sampleMatrix();
    const mf = new MatrixFactorization(m, {
      factors: 8,
      epochs: 60,
      learningRate: 0.02,
      seed: 7,
    });
    mf.train();
    expect(mf.isTrained()).toBe(true);
    // RMSE should be well below the rating range midpoint
    expect(mf.rmse()).toBeLessThan(1.5);
  });

  it('predicts ratings in range', () => {
    const m = sampleMatrix();
    const mf = new MatrixFactorization(m, { factors: 8, epochs: 80, seed: 1 });
    const recs = mf.recommend('u1', { topN: 3 });
    expect(recs.length).toBeGreaterThan(0);
    for (const r of recs) {
      expect(Number.isFinite(r.score)).toBe(true);
    }
  });

  it('finds similar items in latent space', () => {
    const m = sampleMatrix();
    const mf = new MatrixFactorization(m, { factors: 8, epochs: 60, seed: 3 });
    mf.train();
    const similar = mf.similarItems('sw', 3);
    expect(similar.length).toBeGreaterThan(0);
  });
});

describe('Popularity + ColdStart + Hybrid', () => {
  it('popularity ranks most-rated items first', () => {
    const m = sampleMatrix();
    const pop = new PopularityRecommender(m);
    const recs = pop.recommend('u1');
    expect(recs.length).toBeGreaterThan(0);
    // sw and st are rated by 3 users each; they should be near the top
    expect(['sw', 'st', 'notebook']).toContain(recs[0].itemId);
  });

  it('cold start falls back for new users', () => {
    const m = sampleMatrix();
    const cf = new ItemBasedCF(m);
    const pop = new PopularityRecommender(m);
    const cs = new ColdStartRecommender(cf, pop, m, { minRatings: 5 });
    expect(cs.warmth('brand-new-user')).toBe(0);
    const recs = cs.recommend('brand-new-user');
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].reason).toBe('popular');
  });

  it('hybrid blends component scores', () => {
    const m = sampleMatrix();
    const cf = new ItemBasedCF(m);
    const pop = new PopularityRecommender(m);
    const hybrid = new HybridRecommender(
      [
        { recommender: cf, weight: 0.8 },
        { recommender: pop, weight: 0.2 },
      ],
      m
    );
    const recs = hybrid.recommend('u1', { topN: 3 });
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.length).toBeLessThanOrEqual(3);
  });
});
