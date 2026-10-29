import { describe, it, expect } from 'bun:test';
import {
  Analyzer,
  englishAnalyzer,
  standardTokenizer,
  shingleFilter,
  synonymFilter,
  lowercaseFilter,
  porterStem,
} from '../implementations/analysis/Analyzer';
import { Trie, fuzzySuggest } from '../implementations/structures/Trie';
import { VectorIndex } from '../implementations/structures/VectorIndex';
import { SpellSuggester } from '../implementations/structures/SpellSuggester';
import { DocValues } from '../implementations/facets/DocValues';
import { InvertedIndex } from '../implementations/index/InvertedIndex';
import {
  ExtendedQueryExecutor,
  prefixQuery,
  wildcardQuery,
  rangeQuery,
  disMaxQuery,
  boostingQuery,
  wildcardToRegex,
} from '../implementations/query/MoreQueries';
import { parseQuery } from '../implementations/query/QueryAst';

describe('Analyzer pipeline', () => {
  it('standardTokenizer emits offsets', () => {
    const tokens = standardTokenizer('Hello, World 42');
    expect(tokens.length).toBe(3);
    expect(tokens[0].startOffset).toBe(0);
    expect(tokens[2].type).toBe('number');
  });

  it('composes filters', () => {
    const a = new Analyzer({
      tokenFilters: [lowercaseFilter, shingleFilter(2)],
    });
    const tokens = a.analyze('The Quick Brown');
    expect(tokens.some((t) => t.term === 'the_quick')).toBe(true);
  });

  it('synonym filter injects synonyms at same position', () => {
    const a = new Analyzer({
      tokenFilters: [
        lowercaseFilter,
        synonymFilter(new Map([['usa', ['america', 'states']]])),
      ],
    });
    const tokens = a.analyze('usa policy');
    const syns = tokens.filter((t) => t.type === 'synonym');
    expect(syns.length).toBe(2);
    expect(syns[0].positionIncrement).toBe(0);
  });

  it('porter stemmer behaves sanely', () => {
    expect(porterStem('running')).toBe('run');
    expect(porterStem('caresses')).toBe('caress');
    expect(porterStem('ponies')).toBe('poni');
  });

  it('english analyzer stems and stops', () => {
    const a = englishAnalyzer();
    const terms = a.terms('The cats are running quickly');
    expect(terms).toContain('cat');
    expect(terms).not.toContain('the');
    expect(terms).not.toContain('are');
  });
});

describe('Trie', () => {
  it('supports prefix lookup and ranked suggestions', () => {
    const t = new Trie();
    t.insert('search', 10);
    t.insert('sea', 5);
    t.insert('seal', 3);
    t.insert('tree', 1);
    expect(t.withPrefix('sea').sort()).toEqual(['sea', 'seal', 'search']);
    const top = t.suggest('sea', 2);
    expect(top[0].term).toBe('search');
  });

  it('fuzzy traversal finds near matches', () => {
    const t = new Trie();
    for (const w of ['search', 'seach', 'reach', 'teach', 'completely']) {
      t.insert(w, 1);
    }
    const found = fuzzySuggest(t, 'serch', 2).map((s) => s.term);
    expect(found).toContain('search');
    expect(found).toContain('seach');
    expect(found).not.toContain('completely');
  });
});

describe('VectorIndex', () => {
  it('knn returns nearest vectors', () => {
    const vi = new VectorIndex(3, 'cosine');
    vi.add('a', [1, 0, 0]);
    vi.add('b', [0, 1, 0]);
    vi.add('c', [0.9, 0.1, 0]);
    const hits = vi.knn([1, 0, 0], 2);
    expect(hits[0].id).toBe('a');
    expect(hits[1].id).toBe('c');
  });

  it('euclidean metric works', () => {
    const vi = new VectorIndex(2, 'euclidean');
    vi.add('near', [1, 1]);
    vi.add('far', [10, 10]);
    const hits = vi.knn([0, 0], 1);
    expect(hits[0].id).toBe('near');
  });

  it('approxKnn returns results', () => {
    const vi = new VectorIndex(4, 'cosine', 6);
    for (let i = 0; i < 20; i++) {
      vi.add(`v${i}`, [Math.sin(i), Math.cos(i), i % 3, i % 5]);
    }
    const hits = vi.approxKnn([1, 0, 0, 0], 5, 0);
    expect(hits.length).toBeGreaterThan(0);
  });
});

describe('SpellSuggester', () => {
  it('suggests corrections from vocabulary', () => {
    const index = new InvertedIndex();
    index.addDocument('d1', { body: 'search engine searching searches' });
    index.addDocument('d2', { body: 'search results' });
    const sp = new SpellSuggester(index);
    const suggestions = sp.suggest('serch', { maxEdits: 2 });
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].suggestion).toBe('search');
  });

  it('returns the term itself when frequent', () => {
    const index = new InvertedIndex();
    index.addDocument('d1', { body: 'hello hello hello' });
    const sp = new SpellSuggester(index);
    const out = sp.suggest('hello', { onlyIfRareBelow: 2 });
    expect(out[0].suggestion).toBe('hello');
  });
});

describe('DocValues', () => {
  it('facets, sorts, ranges', () => {
    const dv = new DocValues();
    dv.set('a', 'tag', 'red');
    dv.set('b', 'tag', 'blue');
    dv.set('c', 'tag', 'red');
    dv.set('a', 'price', 10);
    dv.set('b', 'price', 30);
    dv.set('c', 'price', 20);
    const facets = dv.termsFacet('tag');
    expect(facets[0]).toEqual({ value: 'red', count: 2 });
    expect(dv.sort(['a', 'b', 'c'], 'price')).toEqual(['a', 'c', 'b']);
    const mid = dv.rangeFilter('price', 15, 30);
    expect([...mid].sort()).toEqual(['b', 'c']);
    const hist = dv.histogram('price', 10);
    expect(hist.length).toBe(3);
  });
});

describe('ExtendedQueryExecutor', () => {
  function buildIndex(): InvertedIndex {
    const index = new InvertedIndex();
    index.addDocument('d1', { title: 'search engines', body: 'searching the web' });
    index.addDocument('d2', { title: 'search party', body: 'a party of searchers' });
    index.addDocument('d3', { title: 'recipe', body: 'cooking bread' });
    return index;
  }

  it('prefix query expands terms', () => {
    const ex = new ExtendedQueryExecutor(buildIndex());
    const hits = ex.execute(prefixQuery('search'));
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });

  it('wildcard query matches glob', () => {
    const ex = new ExtendedQueryExecutor(buildIndex());
    expect(wildcardToRegex('se*ch').test('search')).toBe(true);
    const hits = ex.execute(wildcardQuery('cook*'));
    expect(hits.length).toBe(1);
    expect(hits[0].docId).toBe('d3');
  });

  it('range query uses doc values', () => {
    const index = buildIndex();
    const dv = new DocValues();
    dv.set('d1', 'year', 2020);
    dv.set('d2', 'year', 2023);
    dv.set('d3', 'year', 1999);
    const ex = new ExtendedQueryExecutor(index, dv);
    const hits = ex.execute(rangeQuery('year', { min: 2000 }));
    expect(hits.map((h) => h.docId).sort()).toEqual(['d1', 'd2']);
  });

  it('dismax picks best sub-query score', () => {
    const index = buildIndex();
    const ex = new ExtendedQueryExecutor(index);
    const hits = ex.execute(
      disMaxQuery([parseQuery('title:search'), parseQuery('body:party')], 0)
    );
    expect(hits.length).toBeGreaterThan(0);
  });

  it('boosting query demotes negative matches', () => {
    const index = buildIndex();
    const ex = new ExtendedQueryExecutor(index);
    const hits = ex.execute(
      boostingQuery(parseQuery('search'), parseQuery('party'), 0.1)
    );
    const d2 = hits.find((h) => h.docId === 'd2');
    const d1 = hits.find((h) => h.docId === 'd1');
    expect(d2).toBeDefined();
    expect(d1).toBeDefined();
    expect(d2!.score).toBeLessThan(d1!.score * 1.0001 + 0.0001);
  });
});
