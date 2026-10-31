/**
 * Vector/hybrid search engine — unit tests.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  EmbeddingIndex,
  HybridScorer,
  EmbeddingCache,
  SemanticDedup,
  EmbeddingHit,
  SearchClock,
} from '../index';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Deterministic pseudo-random unit-ish vector per key. */
function vec(dims: number, seed: number): number[] {
  let a = seed >>> 0;
  const out: number[] = [];
  for (let i = 0; i < dims; i++) {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    out.push((((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1);
  }
  return out;
}

/** One-hot-ish cluster vector: direction `axis` + small noise. */
function clusterVec(dims: number, axis: number, noiseSeed: number, noise = 0.02): number[] {
  const out = vec(dims, noiseSeed).map((x) => x * noise);
  out[axis % dims] += 1;
  return out;
}

class ManualClock implements SearchClock {
  t = 0;
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
}

/* ------------------------------------------------------------------ */
/* EmbeddingIndex — exact                                              */
/* ------------------------------------------------------------------ */

describe('EmbeddingIndex exact search', () => {
  let idx: EmbeddingIndex;

  beforeEach(() => {
    idx = new EmbeddingIndex({ dims: 8, metric: 'cosine', maxNeighbors: 16 });
    for (let i = 0; i < 50; i++) idx.add(`d${i}`, vec(8, i + 1));
  });

  it('returns the query vector itself as top hit', () => {
    const q = vec(8, 7);
    const hits = idx.search(q, 5, 'exact');
    expect(hits.path).toBe('exact');
    expect(hits.hits[0].id).toBe('d6');
    expect(hits.hits[0].score).toBeCloseTo(1, 6);
  });

  it('respects k and returns sorted results', () => {
    const hits = idx.search(vec(8, 100), 10, 'exact');
    expect(hits.hits.length).toBe(10);
    for (let i = 1; i < hits.hits.length; i++) {
      expect(hits.hits[i - 1].score).toBeGreaterThanOrEqual(hits.hits[i].score);
    }
  });

  it('scores every live vector in exact mode', () => {
    const r = idx.search(vec(8, 3), 5, 'exact');
    expect(r.scored).toBe(50);
  });

  it('supports l2 and dot metrics', () => {
    const l2 = new EmbeddingIndex({ dims: 4, metric: 'l2' });
    l2.add('a', [1, 0, 0, 0]);
    l2.add('b', [0.9, 0.1, 0, 0]);
    l2.add('far', [0, 0, 0, -5]);
    const hits = l2.knn([1, 0, 0, 0], 3);
    expect(hits[0].id).toBe('a');
    expect(hits[1].id).toBe('b');
    expect(hits[2].id).toBe('far');
    expect(hits[0].score).toBeCloseTo(0, 10);
  });

  it('replaces vectors on re-add of the same id', () => {
    idx.add('d0', vec(8, 999));
    const hits = idx.search(vec(8, 999), 1, 'exact');
    expect(hits.hits[0].id).toBe('d0');
    expect(idx.size).toBe(50); // no duplicate slot
  });

  it('honors remove: deleted docs are excluded', () => {
    idx.remove('d6');
    const hits = idx.search(vec(8, 7), 3, 'exact');
    expect(hits.hits.every((h) => h.id !== 'd6')).toBe(true);
    expect(idx.size).toBe(49);
    expect(hits.scored).toBe(49);
  });

  it('rejects mismatched dims', () => {
    expect(() => idx.add('bad', [1, 2, 3])).toThrow();
    expect(() => idx.search([1, 2, 3])).toThrow();
  });

  it('returns a defensive copy from get()', () => {
    const v = idx.get('d0');
    expect(v).toBeDefined();
    v![0] = 999;
    const v2 = idx.get('d0');
    expect(v2![0]).not.toBe(999);
  });
});

/* ------------------------------------------------------------------ */
/* EmbeddingIndex — graph (ANN)                                        */
/* ------------------------------------------------------------------ */

describe('EmbeddingIndex graph search', () => {
  it('achieves high recall on clustered data', () => {
    const dims = 16;
    const idx = new EmbeddingIndex({
      dims,
      metric: 'cosine',
      maxNeighbors: 12,
      efSearch: 40,
      efConstruction: 60,
      seed: 7,
    });
    // 4 clusters × 60 vectors — ANN should stay inside the right cluster
    const centers = [0, 4, 8, 12];
    const n = 240;
    for (let i = 0; i < n; i++) {
      const axis = centers[i % centers.length];
      idx.add(`c${i % centers.length}-${i}`, clusterVec(dims, axis, i * 31 + 5));
    }
    // query near cluster 1's center
    const q = clusterVec(dims, centers[1], 123456, 0.01);
    const hits = idx.search(q, 10);
    expect(hits.path).toBe('graph');
    // every top-10 hit should be a cluster-1 member
    const rightCluster = hits.hits.filter((h) => h.id.startsWith('c1-')).length;
    expect(rightCluster).toBeGreaterThanOrEqual(8);
  });

  it('falls back to exact search for small indexes in auto mode', () => {
    const idx = new EmbeddingIndex({ dims: 4 });
    for (let i = 0; i < 50; i++) idx.add(`s${i}`, vec(4, i));
    const r = idx.search(vec(4, 99), 5);
    expect(r.path).toBe('exact');
  });

  it('handles entry-point removal', () => {
    const idx = new EmbeddingIndex({ dims: 4, maxNeighbors: 8, seed: 1 });
    for (let i = 0; i < 300; i++) idx.add(`e${i}`, vec(4, i + 11));
    const before = idx.stats();
    const firstId = before.levelCounts.length > 0 ? 'e0' : undefined;
    // remove a bunch incl. possible entry point
    for (let i = 0; i < 20; i++) idx.remove(`e${i}`);
    void firstId;
    const r = idx.search(vec(4, 250), 5);
    expect(r.hits.length).toBeGreaterThan(0);
    expect(r.hits.every((h) => !/^e(0|1[0-9]?)$/.test(h.id) || Number(h.id.slice(1)) >= 20)).toBe(true);
  });

  it('compact() preserves live vectors and drops tombstones', () => {
    const dims = 16;
    const idx = new EmbeddingIndex({ dims, maxNeighbors: 12, seed: 3 });
    const centers = [0, 4, 8, 12];
    const n = 300;
    for (let i = 0; i < n; i++) {
      idx.add(`x${i}`, clusterVec(dims, centers[i % centers.length], i * 17 + 3));
    }
    for (let i = 0; i < 100; i++) idx.remove(`x${i}`);
    idx.compact();
    expect(idx.size).toBe(200);
    // compacted graph still finds the right cluster for a center query
    const q = clusterVec(dims, centers[2], 999, 0.01);
    const hits = idx.search(q, 10).hits;
    const clusterIds = new Set<string>();
    for (let i = 0; i < n; i++) {
      if (i % centers.length === 2 && i >= 100) clusterIds.add(`x${i}`);
    }
    const overlap = hits.filter((h) => clusterIds.has(h.id)).length;
    expect(overlap).toBeGreaterThanOrEqual(8);
  });

  it('stats() reports level structure', () => {
    const idx = new EmbeddingIndex({ dims: 8, maxNeighbors: 10, seed: 9 });
    for (let i = 0; i < 400; i++) idx.add(`s${i}`, vec(8, i * 3));
    const st = idx.stats();
    expect(st.size).toBe(400);
    expect(st.levelCounts[0]).toBe(400);
    expect(st.edgeCount).toBeGreaterThan(0);
    // exponentially fewer nodes at higher levels
    for (let l = 1; l < st.levelCounts.length; l++) {
      expect(st.levelCounts[l]).toBeLessThan(st.levelCounts[0]);
    }
  });
});

/* ------------------------------------------------------------------ */
/* HybridScorer                                                        */
/* ------------------------------------------------------------------ */

describe('HybridScorer', () => {
  const bm25: EmbeddingHit[] = [
    { id: 'a', score: 12.5 },
    { id: 'b', score: 9.0 },
    { id: 'c', score: 7.5 },
    { id: 'd', score: 5.0 },
  ];
  const vector: EmbeddingHit[] = [
    { id: 'c', score: 0.95 },
    { id: 'e', score: 0.90 },
    { id: 'a', score: 0.85 },
    { id: 'f', score: 0.80 },
  ];

  it('rrf boosts ids present in both lists', () => {
    const s = new HybridScorer({ method: 'rrf' });
    const out = s.fusePair(bm25, vector, 6);
    // 'a' (bm25#1 + vector#3) and 'c' (bm25#3 + vector#1) top the fusion
    expect(out[0].id === 'a' || out[0].id === 'c').toBe(true);
    const single = out.find((h) => h.id === 'd')!;
    const both = out.find((h) => h.id === 'a')!;
    expect(both.score).toBeGreaterThan(single.score);
    expect(both.sources.sort()).toEqual(['bm25', 'vector']);
    expect(both.bestRank).toBe(1);
  });

  it('rrf score = w/(k+rank) summed over lists', () => {
    const s = new HybridScorer({ rrfK: 60 });
    const out = s.fusePair(bm25, [], 4);
    const a = out.find((h) => h.id === 'a')!;
    expect(a.score).toBeCloseTo(1 / 61, 6);
    const d = out.find((h) => h.id === 'd')!;
    expect(d.score).toBeCloseTo(1 / 64, 6);
  });

  it('minmax normalizes each list independently', () => {
    const s = new HybridScorer({ method: 'minmax' });
    const out = s.fusePair(bm25, vector, 6);
    const a = out.find((h) => h.id === 'a')!;
    // a: bm25 top (norm 1.0) + vector mid (norm ~0.333)
    expect(a.contributions['bm25']).toBeCloseTo(1, 6);
    expect(a.contributions['vector']).toBeCloseTo((0.85 - 0.8) / 0.15, 5);
  });

  it('source weights shift the blend', () => {
    const s = new HybridScorer({ sourceWeights: { bm25: 0, vector: 1 } });
    const out = s.fusePair(bm25, vector, 6);
    // bm25 weight 0 → pure vector order: c first
    expect(out[0].id).toBe('c');
    expect(out.find((h) => h.id === 'b')).toBeUndefined();
  });

  it('agreement() reports overlap and rank correlation', () => {
    const s = new HybridScorer();
    const { overlap, rankCorrelation } = s.agreement(bm25, vector);
    expect(overlap).toBe(2); // a and c
    // a: bm25 rank 0 / vector rank 2; c: bm25 rank 2 / vector rank 0 → discordant
    expect(rankCorrelation).toBe(-1);
  });
});

/* ------------------------------------------------------------------ */
/* EmbeddingCache                                                      */
/* ------------------------------------------------------------------ */

describe('EmbeddingCache', () => {
  const embedder = (text: string): number[] => {
    let h = 0;
    for (const c of text) h = (h * 31 + c.charCodeAt(0)) | 0;
    return [h % 7, (h >> 3) % 5, (h >> 7) % 3, 1];
  };

  it('caches embedder output by normalized key', () => {
    const c = new EmbeddingCache({ capacity: 10, dims: 4 });
    let calls = 0;
    const e = (t: string): number[] => {
      calls++;
      return embedder(t);
    };
    const v1 = c.embed('  Hello   World ', e);
    const v2 = c.embed('hello world', e); // same normalized key
    expect(calls).toBe(1);
    expect([...v1]).toEqual([...v2]);
    expect(c.stats().hitRate).toBeCloseTo(0.5, 5);
  });

  it('evicts least-recently-used at capacity', () => {
    const c = new EmbeddingCache({ capacity: 3 });
    const e = embedder;
    c.embed('a', e);
    c.embed('b', e);
    c.embed('c', e);
    c.embed('a', e); // refresh a → LRU order: b,c? no: c,b? a is now MRU; b is LRU
    c.embed('d', e); // evicts b
    expect(c.peek('b')).toBeUndefined();
    expect(c.peek('a')).toBeDefined();
    expect(c.stats().evictions).toBe(1);
  });

  it('expires entries after ttl', () => {
    const clock = new ManualClock();
    const c = new EmbeddingCache({ capacity: 10, ttlMs: 1000 }, clock);
    let calls = 0;
    const e = (t: string): number[] => {
      calls++;
      return embedder(t);
    };
    c.embed('x', e);
    clock.advance(1500);
    c.embed('x', e);
    expect(calls).toBe(2);
    expect(c.stats().expirations).toBe(1);
  });

  it('sweep() removes expired entries eagerly', () => {
    const clock = new ManualClock();
    const c = new EmbeddingCache({ ttlMs: 500 }, clock);
    c.embed('p', embedder);
    c.embed('q', embedder);
    clock.advance(600);
    expect(c.sweep()).toBe(2);
    expect(c.stats().size).toBe(0);
  });

  it('validates embedder dims when configured', () => {
    const c = new EmbeddingCache({ dims: 8 });
    expect(() => c.embed('x', embedder)).toThrow();
  });

  it('embedAsync shares the cache with sync path', async () => {
    const c = new EmbeddingCache({ dims: 4 });
    let calls = 0;
    const e = async (t: string): Promise<number[]> => {
      calls++;
      return embedder(t);
    };
    await c.embedAsync('k', e);
    await c.embedAsync('k', e);
    expect(calls).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* SemanticDedup                                                       */
/* ------------------------------------------------------------------ */

describe('SemanticDedup', () => {
  it('flags near-identical vectors as duplicates', () => {
    const d = new SemanticDedup(16, { threshold: 0.95, signatureSize: 64 });
    const base = clusterVec(16, 2, 500);
    const noisy = clusterVec(16, 2, 501, 0.001);
    const r1 = d.check('orig', base);
    expect(r1.duplicate).toBe(false);
    const r2 = d.check('copy', noisy);
    expect(r2.duplicate).toBe(true);
    expect(r2.match).toBe('orig');
    expect(r2.similarity).toBeGreaterThan(0.99);
    expect(r2.cluster).toBe('orig');
  });

  it('accepts genuinely different vectors', () => {
    const d = new SemanticDedup(16, { threshold: 0.95 });
    d.check('a', clusterVec(16, 0, 10));
    const r = d.check('b', clusterVec(16, 8, 11));
    expect(r.duplicate).toBe(false);
  });

  it('clusters transitive near-duplicates under one canonical', () => {
    const d = new SemanticDedup(16, { threshold: 0.9, candidateK: 10 });
    const v = (s: number, n: number): number[] => clusterVec(16, 3, s, n);
    d.check('x', v(100, 0.001));
    d.check('y', v(101, 0.0015)); // ≈ x
    d.check('z', v(102, 0.002)); // ≈ both
    const clusters = d.clusters();
    expect(clusters.length).toBe(1);
    expect(clusters[0].members.sort()).toEqual(['x', 'y', 'z']);
    expect(d.clusterOf('z')).toBe('x');
    expect(d.isDuplicate('x')).toBe(true);
  });

  it('check(add=false) is read-only', () => {
    const d = new SemanticDedup(8, { threshold: 0.9 });
    d.check('one', clusterVec(8, 1, 42));
    const r = d.check('two', clusterVec(8, 1, 43, 0.001), false);
    expect(r.duplicate).toBe(true);
    expect(d.size).toBe(1); // 'two' was not indexed
  });

  it('exact re-check of the same id short-circuits', () => {
    const d = new SemanticDedup(8, {});
    d.check('same', vec(8, 5));
    const r = d.check('same', vec(8, 5));
    expect(r.duplicate).toBe(true);
    expect(r.path).toBe('exact');
    expect(d.size).toBe(1);
  });

  it('similarity() computes exact cosine between indexed docs', () => {
    const d = new SemanticDedup(8, {});
    d.check('p', [1, 0, 0, 0, 0, 0, 0, 0]);
    d.check('q', [1, 0, 0, 0, 0, 0, 0, 0]);
    expect(d.similarity('p', 'q')).toBeCloseTo(1, 6);
    expect(d.similarity('p', 'missing')).toBeUndefined();
  });
});
