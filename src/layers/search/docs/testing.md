# Testing: Search Layer

## Test Files

| File | Scope |
|------|-------|
| `__tests__/SearchEngine.test.ts` | `Tokenizer` (stemming, stop words), `InvertedIndex` (postings, positions), `Scoring` (idf/TF-IDF/BM25), `FuzzyMatch` (Levenshtein/Damerau/n-gram), query parser (boolean, field, phrase, fuzzy, boost), `QueryExecutor` + `SearchEngine` end-to-end, `Highlighter` |
| `__tests__/SearchExtended.test.ts` | `Analyzer` pipeline, `Trie` autocomplete, `VectorIndex` k-NN, `SpellSuggester`, `DocValues` faceting/sorting, `ExtendedQueryExecutor` |
| `__tests__/Search.test.ts` | `Search` facade: config, `execute()` result envelope |
| `__tests__/SearchStrategies.test.ts` | Five strategies + `SearchStrategyFactory` |
| `__tests__/SearchConfiguration.test.ts` | `SearchConfigurationBuilder`, `SearchConfigurationValidator` |
| `domain/__tests__/` | `SearchDomain`, `SearchExtendedDomain`, `SearchPatterns`, `SearchServices` — entities, value objects, specifications, policies, pipeline, decorators, handlers, repository |

## Running Tests

```bash
bun test ./src/layers/search/
```

Single file:

```bash
bun test ./src/layers/search/__tests__/SearchEngine.test.ts
```

Tests use `bun:test` (`describe`/`it`/`expect`). The engine is fully
in-memory — no external search service is needed.
