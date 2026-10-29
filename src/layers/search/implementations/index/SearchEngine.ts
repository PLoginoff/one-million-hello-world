/**
 * SearchEngine
 *
 * Facade over the inverted index, query parser/executor, and highlighter.
 * Provides a simple document-oriented API: add/remove documents, then
 * query with a mini query language or programmatic ASTs.
 */

import { InvertedIndex, IndexedDocument, IndexStats } from './InvertedIndex';
import { Tokenizer, TokenizerOptions } from './Tokenizer';
import { QueryNode, parseQuery } from '../query/QueryAst';
import { QueryExecutor, SearchHit, ExecuteOptions } from '../query/QueryExecutor';
import { Highlighter, HighlightedField, HighlightOptions } from '../query/Highlighter';
import { Bm25Params } from './Scoring';

export interface SearchEngineOptions {
  readonly tokenizer?: Partial<TokenizerOptions>;
  readonly bm25?: Bm25Params;
  readonly highlight?: Partial<HighlightOptions>;
  /** default fields to search when a query has no field clause */
  readonly defaultFields?: readonly string[];
}

export interface SearchEngineHit {
  readonly docId: string;
  readonly score: number;
  readonly document: IndexedDocument | undefined;
  readonly matchedFields: readonly string[];
  readonly matchedTerms: readonly string[];
  readonly highlights: readonly HighlightedField[];
}

export interface SearchEngineResult {
  readonly total: number;
  readonly hits: readonly SearchEngineHit[];
  readonly tookMs: number;
  readonly query: QueryNode;
}

export class SearchEngine {
  private readonly index: InvertedIndex;
  private readonly tokenizer: Tokenizer;
  private readonly executor: QueryExecutor;
  private readonly highlighter: Highlighter;
  private readonly defaultFields: readonly string[] | undefined;

  constructor(options: SearchEngineOptions = {}) {
    this.tokenizer = new Tokenizer({
      removeStopWords: true,
      ...options.tokenizer,
    });
    this.index = new InvertedIndex(this.tokenizer);
    this.executor = new QueryExecutor(this.index, options.bm25);
    this.highlighter = new Highlighter(this.tokenizer, options.highlight);
    this.defaultFields = options.defaultFields;
  }

  addDocument(id: string, fields: Record<string, string>): void {
    this.index.addDocument(id, fields);
  }

  addDocuments(docs: ReadonlyArray<{ id: string; fields: Record<string, string> }>): void {
    for (const d of docs) this.index.addDocument(d.id, d.fields);
  }

  removeDocument(id: string): boolean {
    return this.index.removeDocument(id);
  }

  getDocument(id: string): IndexedDocument | undefined {
    return this.index.getDocument(id);
  }

  stats(): IndexStats {
    return this.index.stats();
  }

  getIndex(): InvertedIndex {
    return this.index;
  }

  /** Query using the mini query language. */
  search(queryText: string, options: ExecuteOptions = {}): SearchEngineResult {
    const query = parseQuery(queryText);
    return this.searchAst(query, options);
  }

  /** Query using a programmatic AST. */
  searchAst(query: QueryNode, options: ExecuteOptions = {}): SearchEngineResult {
    const start = Date.now();
    const merged: ExecuteOptions = {
      ...options,
      fields: options.fields ?? this.defaultFields,
    };
    const hits: SearchHit[] = this.executor.execute(query, merged);
    const engineHits: SearchEngineHit[] = hits.map((h) => {
      const doc = this.index.getDocument(h.docId);
      const highlights = doc !== undefined
        ? this.highlighter.highlightDocument(doc.fields, h.matchedTerms)
        : [];
      return {
        docId: h.docId,
        score: h.score,
        document: doc,
        matchedFields: h.matchedFields,
        matchedTerms: h.matchedTerms,
        highlights,
      };
    });
    return {
      total: engineHits.length,
      hits: engineHits,
      tookMs: Date.now() - start,
      query,
    };
  }
}
