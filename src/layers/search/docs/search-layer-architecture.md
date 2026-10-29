# Search Layer Architecture

## Position
Data Layer 1

## Responsibility
Full-text and vector search. The layer ships a working in-memory search
engine under `implementations/` plus the standard layer scaffold
(strategies, domain, adapters) around it.

## Components

### Search engine (`implementations/`)

`SearchEngine` (`implementations/index/SearchEngine.ts`) is the facade:
add/remove documents, then run the mini query language or a
programmatic AST. It composes the index, tokenizer, query executor,
and highlighter.

| Sub-package | Files | Purpose |
|-------------|-------|---------|
| `index/` | `Tokenizer.ts` | Normalizes text: lowercase, punctuation stripping, stop-word removal, min-length filter, Porter-style suffix stemming. |
| | `InvertedIndex.ts` | Postings lists **with positions** per term; document store; `IndexStats`. |
| | `Scoring.ts` | `idf`, `tfIdfWeight` (sqrt(tf)·idf), BM25 with `k1`/`b` params, cosine similarity over term-weight vectors. |
| | `FuzzyMatch.ts` | Levenshtein (two-row DP), Damerau transposition variant, n-gram Jaccard/dice similarity. |
| | `SearchEngine.ts` | Facade wiring index + parser + executor + highlighter. |
| `analysis/` | `Analyzer.ts` | Lucene-style pipeline: char filters → tokenizer → token filters; `AnalyzedToken` with offsets/positions; `standardTokenizer` plus shingle/synonym token types. |
| `query/` | `QueryAst.ts` | `QueryNode` union (term/phrase/boolean/field/match-all) and a recursive-descent parser: `AND`/`OR`/`NOT`, implicit AND, `field:` clauses, `"phrase"~slop`, `term~fuzz`, `^boost`, parentheses. |
| | `QueryExecutor.ts` | Executes the AST against the index; `SearchHit`, `ExecuteOptions`. `MoreQueries.ts` adds extended query forms. |
| | `Highlighter.ts` | Snippet extraction and term highlighting per field. |
| `structures/` | `Trie.ts` | Prefix trie for autocomplete. |
| | `SpellSuggester.ts` | SymSpell-style "did you mean": single-edit candidate generation ranked by term frequency + edit distance. |
| | `VectorIndex.ts` | Dense vectors, cosine/euclidean/dot-product metrics, exact k-NN, optional random-projection pruning. |
| `facets/` | `DocValues.ts` | Column-oriented per-doc field storage for faceting (`FacetBucket`), sorting, and range filtering. |

### Layer scaffold
- `Search` facade (`implementations/Search.ts`) + `ISearch` (`interfaces/`) —
  the generic `execute(context)` contract returning `SearchResult<T>`.
- Five strategies: `SearchDefaultStrategy` (0), `SearchFastStrategy` (10),
  `SearchReliableStrategy` (5), `SearchCachedStrategy` (7),
  `SearchBatchStrategy` (3), created by `SearchStrategyFactory`.
- `domain/` — entities (`SearchEntity`, `SearchExecution`,
  `SearchConfigState`, `SearchMetricsSnapshot`), value objects
  (`SearchThreshold`, `SearchPriority`, `SearchTimeWindow`), services,
  repository, specifications, policies, pipeline, decorators, handlers,
  events (`SearchExecuted`/`SearchFailed`).
- Adapters: `InMemoryAdapter`, `MockAdapter`, `StubAdapter`.
- Cross-cutting: `SearchHealthCheck`, `SearchMetricsCollector`,
  `SearchPrometheusMetricsCollector`, `SearchError`/`SearchErrorMapper`.

## Query language
`field:term`, `"exact phrase"`, `term~2` (fuzzy max edit distance),
`term^3` (boost), `AND`/`OR`/`NOT`, implicit AND, grouping with `()`.

## Testing
See `testing.md`.
