/**
 * Search Engine — unit tests.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  SymSpellIndex,
  deletes,
  damerauLevenshteinBounded,
  AutocompleteIndex,
  QueryUnderstanding,
  LearningToRank,
  RankCandidate,
} from '../index';

/* ------------------------------------------------------------------ */
/* SymSpellIndex                                                        */
/* ------------------------------------------------------------------ */

describe('deletes', () => {
  it('enumerates all single deletions', () => {
    expect(deletes('abc', 1)).toEqual(new Set(['bc', 'ac', 'ab']));
  });
  it('enumerates deletions up to depth 2 without duplicates', () => {
    const d = deletes('aab', 2);
    expect(d.has('ab')).toBe(true);
    expect(d.has('a')).toBe(true);
    // 'aa','ab','b','a' — no 'aab' itself
    expect(d.has('aab')).toBe(false);
  });
});

describe('damerauLevenshteinBounded', () => {
  it('computes exact distances', () => {
    expect(damerauLevenshteinBounded('kitten', 'sitting', 10)).toBe(3);
    expect(damerauLevenshteinBounded('ab', 'ba', 10)).toBe(1); // transposition
    expect(damerauLevenshteinBounded('abc', 'abc', 10)).toBe(0);
  });
  it('respects the bound', () => {
    expect(damerauLevenshteinBounded('abcdef', 'xyz', 2)).toBe(3);
    expect(damerauLevenshteinBounded('aaaa', 'aabb', 1)).toBe(2);
  });
});

describe('SymSpellIndex', () => {
  let idx: SymSpellIndex;

  beforeEach(() => {
    idx = new SymSpellIndex({ maxEditDistance: 2 });
    idx.add('spelling', 100);
    idx.add('spilling', 40);
    idx.add('spellingly', 5);
    idx.add('hello', 200);
    idx.add('world', 150);
  });

  it('finds a misspelled term within edit distance', () => {
    const s = idx.lookup('speling');
    expect(s.length).toBeGreaterThan(0);
    expect(s[0].term).toBe('spelling');
    expect(s[0].editDistance).toBe(1);
  });

  it('ranks by frequency when distances tie', () => {
    // 'hellp' is distance 1 from 'hello' only
    const s = idx.lookup('hellp');
    expect(s[0].term).toBe('hello');
    expect(s[0].frequency).toBe(200);
  });

  it('exact query returns itself at distance 0', () => {
    const s = idx.lookup('hello');
    expect(s[0].term).toBe('hello');
    expect(s[0].editDistance).toBe(0);
  });

  it('returns nothing beyond max edit distance', () => {
    expect(idx.lookup('xyzzy')).toEqual([]);
  });

  it('handles transpositions', () => {
    const s = idx.lookup('hlelo');
    expect(s[0].term).toBe('hello');
    expect(s[0].editDistance).toBe(1);
  });

  it('correct returns best suggestion', () => {
    expect(idx.correct('wrld')).toBe('world');
    expect(idx.correct('qqqqq')).toBeUndefined();
  });

  it('respects minFrequency', () => {
    const picky = new SymSpellIndex({ maxEditDistance: 2, minFrequency: 50 });
    picky.add('alpha', 10);
    picky.add('beta', 100);
    const s = picky.lookup('alpa');
    expect(s.find((x) => x.term === 'alpha')).toBeUndefined();
  });

  it('accumulates frequency on repeated adds', () => {
    idx.add('hello', 50);
    expect(idx.frequencyOf('hello')).toBe(250);
    expect(idx.termCount).toBe(5);
  });
});

/* ------------------------------------------------------------------ */
/* AutocompleteIndex                                                    */
/* ------------------------------------------------------------------ */

describe('AutocompleteIndex', () => {
  let ac: AutocompleteIndex;

  beforeEach(() => {
    ac = new AutocompleteIndex({ topK: 3 });
    ac.insert('apple', 50);
    ac.insert('application', 40);
    ac.insert('app', 90);
    ac.insert('apply', 30);
    ac.insert('apex', 20);
    ac.insert('banana', 10);
  });

  it('returns top-k completions under a prefix by weight', () => {
    const c = ac.complete('app');
    expect(c.length).toBe(3);
    expect(c.map((x) => x.term)).toEqual(['app', 'apple', 'application']);
  });

  it('respects caller k < cached topK', () => {
    const c = ac.complete('app', 2);
    expect(c.length).toBe(2);
    expect(c[0].term).toBe('app');
  });

  it('returns [] for unknown prefix', () => {
    expect(ac.complete('zzz')).toEqual([]);
  });

  it('accumulates weight on repeat inserts', () => {
    ac.insert('apply', 100); // now 130 > app's 90
    const c = ac.complete('app');
    expect(c[0].term).toBe('apply');
  });

  it('fuzzyComplete tolerates a typo in the prefix', () => {
    // 'appl' → 'apple' = 1 deletion; 'app' = exact-0
    const c = ac.fuzzyComplete('appl', 1, 5);
    expect(c.some((x) => x.term === 'apple')).toBe(true);
    expect(c.some((x) => x.term === 'apply')).toBe(true);
  });

  it('decay reweights terms and rebuilds caches', () => {
    ac.insert('apply', 100); // apply=130, app=90
    ac.decay(0.5);
    expect(ac.weightOf('apply')).toBe(65);
    const c = ac.complete('app');
    expect(c[0].term).toBe('apply'); // still on top after uniform decay
  });
});

/* ------------------------------------------------------------------ */
/* QueryUnderstanding                                                   */
/* ------------------------------------------------------------------ */

describe('QueryUnderstanding', () => {
  const qu = new QueryUnderstanding({ knownFields: ['title', 'author', 'tag'] });

  it('detects quoted phrase intent', () => {
    const u = qu.understand('"new york times"');
    expect(u.intent).toBe('phrase');
    expect(u.phrase).toBe('new york times');
    expect(u.terms.length).toBe(3);
  });

  it('detects fielded clauses', () => {
    const u = qu.understand('title:dune author:herbert');
    expect(u.intent).toBe('fielded');
    expect(u.terms).toEqual([
      { text: 'dune', field: 'title' },
      { text: 'herbert', field: 'author' },
    ]);
  });

  it('ignores unknown fields when knownFields is set', () => {
    const u = qu.understand('time:10 muffin recipe');
    expect(u.intent).toBe('ranked');
  });

  it('accepts any field when knownFields omitted', () => {
    const any = new QueryUnderstanding();
    expect(any.intentOf('weird:thing')).toBe('fielded');
  });

  it('detects fuzzy markers', () => {
    const u = qu.understand('tokeniztion~2');
    expect(u.intent).toBe('fuzzy');
    expect(u.terms[0].text).toBe('tokeniztion');
    expect(u.terms[0].fuzzy).toBe(2);
  });

  it('detects wildcards', () => {
    const u = qu.understand('comp*');
    expect(u.intent).toBe('fuzzy');
    expect(u.terms[0].wildcard).toBe(true);
  });

  it('detects exact single term', () => {
    const u = qu.understand('refrigerator');
    expect(u.intent).toBe('exact');
    expect(u.confidence).toBeGreaterThan(0.5);
  });

  it('defaults to ranked for free text', () => {
    const u = qu.understand('best laptops for students');
    expect(u.intent).toBe('ranked');
    expect(u.terms.length).toBe(4);
  });

  it('detects cjk script', () => {
    expect(qu.understand('\u6771\u4eac').script).toBe('cjk');
    expect(qu.understand('hello world').script).toBe('latin');
    expect(qu.understand('abc').script).toBe('latin');
  });

  it('handles empty input', () => {
    const u = qu.understand('   ');
    expect(u.intent).toBe('ranked');
    expect(u.terms).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* LearningToRank                                                       */
/* ------------------------------------------------------------------ */

describe('LearningToRank', () => {
  let ltr: LearningToRank;
  const cand = (docId: string, f: RankCandidate['features']): RankCandidate => ({
    docId,
    features: f,
  });

  beforeEach(() => {
    ltr = new LearningToRank();
  });

  it('orders by weighted feature sum', () => {
    const r = ltr.rerank(
      [
        cand('a', { textScore: 1 }),
        cand('b', { textScore: 5 }),
        cand('c', { textScore: 3 }),
      ],
    );
    expect(r.map((x) => x.docId)).toEqual(['b', 'c', 'a']);
  });

  it('normalizes features across the candidate set', () => {
    // textScore range 0..100, popularity 0..1 → without normalization
    // text would dominate even at equal weights.
    const r = ltr.rerank(
      [
        cand('texty', { textScore: 100, popularityScore: 0 }),
        cand('pop', { textScore: 0, popularityScore: 1 }),
      ],
    );
    // weights: text 1.0 vs pop 0.5 → texty still wins but pop scores
    expect(r[0].docId).toBe('texty');
    expect(r[1].contributions.popularityScore).toBeCloseTo(0.5);
  });

  it('exactMatch bonus can flip the order', () => {
    // ranges: textScore 0..1 → 'b' normalizes to 0.5; b's total
    // 0.5·1 + 0.8 = 1.3 beats 'a' = 1.0
    const r = ltr.rerank(
      [
        cand('a', { textScore: 1 }),
        cand('b', { textScore: 0.5, exactMatch: 1 }),
        cand('c', { textScore: 0 }),
      ],
    );
    expect(r[0].docId).toBe('b');
  });

  it('extra features contribute when weighted', () => {
    const w = new LearningToRank(
      { extra: { freshness: 2 } },
      false
    );
    const r = w.rerank([
      cand('a', { textScore: 1 }),
      cand('b', { textScore: 1, extra: { freshness: 0.5 } }),
    ]);
    expect(r[0].docId).toBe('b');
    expect(r[0].contributions['extra.freshness']).toBeCloseTo(1);
  });

  it('online update raises weight toward clicked features', () => {
    const lr = new LearningToRank({}, false, 1);
    const before = lr.weights.popularityScore;
    for (let i = 0; i < 30; i++) {
      lr.update(cand('d', { textScore: 0, popularityScore: 5 }), true);
    }
    expect(lr.weights.popularityScore).toBeGreaterThan(before);
  });

  it('empty candidates rank empty', () => {
    expect(ltr.rerank([])).toEqual([]);
  });
});
