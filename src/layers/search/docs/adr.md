# ADR: Search Layer

## Status
Accepted

## Context
The platform needs full-text search, autocomplete, spell suggestion,
faceting, and vector k-NN without an external engine dependency —
self-contained so it runs in tests and offline.

## Decisions

### 1. Inverted index with positions
`InvertedIndex` stores positional postings so phrase queries with slop
(`"a b"~2`) and span logic can be evaluated exactly rather than
approximated by document co-occurrence.

### 2. Lucene-inspired component split
Tokenizer → Analyzer (char filters / tokenizer / token filters) →
InvertedIndex → QueryParser(AST) → QueryExecutor → Highlighter mirrors
Lucene's architecture. Each stage is independently testable and
replaceable; `SearchEngine` is only a facade over them.

### 3. Recursive-descent query parser to a typed AST
`QueryAst.ts` parses the mini-language (`AND`/`OR`/`NOT`, `field:`,
phrases with `~slop`, `~fuzz`, `^boost`) into a `QueryNode` union.
Programmatic ASTs and the string language share the same executor, so
both APIs stay consistent.

### 4. BM25 as default scoring, TF-IDF and cosine available
`Scoring.ts` exposes `idf`, `tfIdfWeight`, and BM25 (`k1`, `b`).
`QueryExecutor` defaults to BM25 — the de-facto standard for text
ranking — while keeping the simpler alternatives for comparison.

### 5. Auxiliary structures co-located
`Trie` (autocomplete), `SpellSuggester` (SymSpell single-edit
candidates ranked by frequency), `VectorIndex` (exact k-NN plus
random-projection pruning), and `DocValues` (columnar faceting/sorting)
live beside the engine because they consume the same index vocabulary
and document store.

### 6. Simplified stemmer instead of full Porter
The tokenizer's `stem` option applies a deterministic suffix-stripping
stemmer covering common English inflections — good enough for recall
without the complexity/edge-cases of full Porter.

## Consequences
- Pure TypeScript, zero external services: usable in every test.
- Positional index costs more memory than doc-level postings but
  enables exact phrase/slop matching.
- Vector search is exact k-NN; the projection hash is a best-effort
  pruning aid, not an ANN guarantee.
