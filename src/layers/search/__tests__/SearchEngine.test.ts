import { describe, it, expect, beforeEach } from 'bun:test';
import { SearchEngine } from '../implementations/index/SearchEngine';
import { InvertedIndex } from '../implementations/index/InvertedIndex';
import { Tokenizer, simpleStem } from '../implementations/index/Tokenizer';
import {
  bm25TermScore,
  idf,
  cosineSimilarity,
  buildTfIdfVector,
} from '../implementations/index/Scoring';
import {
  levenshtein,
  damerauLevenshtein,
  ngramDice,
  fuzzyExpand,
} from '../implementations/index/FuzzyMatch';
import { parseQuery } from '../implementations/query/QueryAst';
import { QueryExecutor } from '../implementations/query/QueryExecutor';
import { Highlighter } from '../implementations/query/Highlighter';

describe('Tokenizer', () => {
  it('tokenizes and lowercases', () => {
    const t = new Tokenizer();
    const tokens = t.tokenize('Hello, World!');
    expect(tokens.map((x) => x.term)).toEqual(['hello', 'world']);
  });

  it('removes stop words', () => {
    const t = new Tokenizer({ removeStopWords: true });
    expect(t.terms('the cat and the dog')).toEqual(['cat', 'dog']);
  });

  it('stems words', () => {
    expect(simpleStem('running')).toBe('run');
    expect(simpleStem('cats')).toBe('cat');
    expect(simpleStem('ponies')).toBe('pony');
  });
});

describe('InvertedIndex', () => {
  let index: InvertedIndex;
  beforeEach(() => {
    index = new InvertedIndex();
    index.addDocument('d1', { title: 'hello world', body: 'a hello test world' });
    index.addDocument('d2', { title: 'world news', body: 'news of the world' });
  });

  it('builds postings with frequencies', () => {
    const stats = index.stats();
    expect(stats.documentCount).toBe(2);
    expect(index.documentFrequency('hello')).toBe(1);
    expect(index.documentFrequency('world')).toBe(2);
  });

  it('tracks positions for phrases', () => {
    const positions = index.positions('hello', 'd1', 'title');
    expect(positions.length).toBeGreaterThan(0);
  });

  it('removes documents', () => {
    index.removeDocument('d1');
    expect(index.documentFrequency('hello')).toBe(0);
    expect(index.stats().documentCount).toBe(1);
  });
});

describe('Scoring', () => {
  it('idf is positive and decreases with df', () => {
    const low = idf(10, 1);
    const high = idf(10, 9);
    expect(low).toBeGreaterThan(high);
    expect(high).toBeGreaterThanOrEqual(0);
  });

  it('bm25 rewards term frequency', () => {
    const s1 = bm25TermScore(1, 1, 10, 10, 10);
    const s3 = bm25TermScore(3, 1, 10, 10, 10);
    expect(s3).toBeGreaterThan(s1);
  });

  it('cosine similarity works on tf-idf vectors', () => {
    const index = new InvertedIndex();
    index.addDocument('d1', { body: 'cat dog cat' });
    index.addDocument('d2', { body: 'cat bird' });
    const terms = index.vocabulary();
    const v1 = buildTfIdfVector(index, 'd1', terms, 'body');
    const v2 = buildTfIdfVector(index, 'd2', terms, 'body');
    const sim = cosineSimilarity(v1, v2);
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThanOrEqual(1);
    expect(cosineSimilarity(v1, v1)).toBeCloseTo(1, 5);
  });
});

describe('FuzzyMatch', () => {
  it('computes levenshtein distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('abc', 'abc')).toBe(0);
    expect(levenshtein('', 'abc')).toBe(3);
  });

  it('damerau counts transpositions', () => {
    expect(damerauLevenshtein('ab', 'ba')).toBe(1);
    expect(levenshtein('ab', 'ba')).toBe(2);
  });

  it('ngram dice similarity', () => {
    expect(ngramDice('night', 'nacht')).toBeGreaterThan(0);
    expect(ngramDice('abc', 'abc')).toBe(1);
  });

  it('fuzzyExpand finds near terms', () => {
    const vocab = ['search', 'seach', 'reach', 'completely'];
    const found = fuzzyExpand('serch', vocab, { maxEdits: 2 });
    const terms = found.map((f) => f.term);
    expect(terms).toContain('search');
    expect(terms).toContain('seach');
    expect(terms).not.toContain('completely');
  });
});

describe('QueryParser', () => {
  it('parses a bare term', () => {
    const q = parseQuery('hello');
    expect(q.kind).toBe('term');
  });

  it('parses implicit AND', () => {
    const q = parseQuery('hello world');
    expect(q.kind).toBe('boolean');
    if (q.kind === 'boolean') {
      expect(q.clauses.every((c) => c.occur === 'must')).toBe(true);
    }
  });

  it('parses OR', () => {
    const q = parseQuery('hello OR world');
    expect(q.kind).toBe('boolean');
    if (q.kind === 'boolean') {
      expect(q.clauses.every((c) => c.occur === 'should')).toBe(true);
    }
  });

  it('parses NOT', () => {
    const q = parseQuery('hello NOT world');
    expect(q.kind).toBe('boolean');
    if (q.kind === 'boolean') {
      expect(q.clauses.some((c) => c.occur === 'must_not')).toBe(true);
    }
  });

  it('parses field clause', () => {
    const q = parseQuery('title:hello');
    expect(q.kind).toBe('field');
  });

  it('parses phrase with slop and boost', () => {
    const q = parseQuery('"hello world"~2^3');
    expect(q.kind).toBe('phrase');
    if (q.kind === 'phrase') {
      expect(q.slop).toBe(2);
      expect(q.boost).toBe(3);
    }
  });

  it('parses fuzzy term', () => {
    const q = parseQuery('helo~1');
    expect(q.kind).toBe('term');
    if (q.kind === 'term') {
      expect(q.fuzziness).toBe(1);
    }
  });

  it('parses nested groups', () => {
    const q = parseQuery('(a OR b) AND c');
    expect(q.kind).toBe('boolean');
  });
});

describe('QueryExecutor + SearchEngine', () => {
  let engine: SearchEngine;
  beforeEach(() => {
    engine = new SearchEngine();
    engine.addDocuments([
      { id: 'd1', fields: { title: 'the quick brown fox', body: 'jumps over the lazy dog' } },
      { id: 'd2', fields: { title: 'quick silver', body: 'mercury rising quick' } },
      { id: 'd3', fields: { title: 'lazy sunday', body: 'a lazy afternoon nap' } },
    ]);
  });

  it('finds documents by term', () => {
    const r = engine.search('quick');
    expect(r.total).toBe(2);
    const ids = r.hits.map((h) => h.docId);
    expect(ids).toContain('d1');
    expect(ids).toContain('d2');
  });

  it('boolean AND narrows results', () => {
    const r = engine.search('quick AND fox');
    expect(r.total).toBe(1);
    expect(r.hits[0].docId).toBe('d1');
  });

  it('boolean OR broadens results', () => {
    const r = engine.search('fox OR mercury');
    expect(r.total).toBe(2);
  });

  it('NOT excludes documents', () => {
    const r = engine.search('quick NOT fox');
    expect(r.total).toBe(1);
    expect(r.hits[0].docId).toBe('d2');
  });

  it('field-scoped query only matches that field', () => {
    const r = engine.search('title:lazy');
    expect(r.total).toBe(1);
    expect(r.hits[0].docId).toBe('d3');
  });

  it('phrase query matches adjacent terms', () => {
    const r = engine.search('"quick brown"');
    expect(r.total).toBe(1);
    expect(r.hits[0].docId).toBe('d1');
  });

  it('phrase with slop matches non-adjacent terms', () => {
    // "quick fox" is not adjacent in d1 ("quick brown fox")
    const exact = engine.search('"quick fox"');
    expect(exact.total).toBe(0);
    const sloppy = engine.search('"quick fox"~2');
    expect(sloppy.total).toBe(1);
    expect(sloppy.hits[0].docId).toBe('d1');
  });

  it('fuzzy term matches misspellings', () => {
    const r = engine.search('quik~1');
    expect(r.total).toBeGreaterThanOrEqual(1);
  });

  it('field boost changes ranking', () => {
    engine.addDocument('d4', { title: 'x', body: 'quick quick quick' });
    const plain = engine.search('quick');
    const boosted = engine.search('quick', { fieldBoosts: { title: 10 } });
    // d2 has 'quick' in title AND body; boosting title favors d2 more
    expect(boosted.hits[0].docId).toBe('d2');
    expect(plain.total).toBe(boosted.total);
  });

  it('produces highlights', () => {
    const r = engine.search('quick');
    const hit = r.hits.find((h) => h.docId === 'd1');
    expect(hit).toBeDefined();
    expect(hit!.highlights.length).toBeGreaterThan(0);
    expect(hit!.highlights[0].fragments[0]).toContain('<em>');
  });

  it('match_all returns everything', () => {
    const r = engine.search('*:*');
    expect(r.total).toBe(3);
  });

  it('executor respects limit', () => {
    const index = new InvertedIndex();
    for (let i = 0; i < 10; i++) {
      index.addDocument(`doc${i}`, { body: 'common term here' });
    }
    const ex = new QueryExecutor(index);
    const hits = ex.execute(parseQuery('common'), { limit: 3 });
    expect(hits.length).toBe(3);
  });
});

describe('Highlighter', () => {
  it('wraps matched terms in tags', () => {
    const h = new Highlighter(new Tokenizer());
    const fragments = h.highlight('the quick brown fox jumps', ['quick']);
    expect(fragments[0]).toContain('<em>quick</em>');
  });
});
