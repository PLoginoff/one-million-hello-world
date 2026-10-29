/**
 * InvertedIndex
 *
 * An in-memory inverted index mapping terms -> posting lists.
 * Each posting records the document id, term frequency, and positions,
 * which enables phrase queries and positional scoring.
 */

import { Tokenizer } from './Tokenizer';

export interface Posting {
  readonly docId: string;
  readonly field: string;
  readonly frequency: number;
  readonly positions: readonly number[];
}

export interface IndexedDocument {
  readonly id: string;
  readonly fields: Readonly<Record<string, string>>;
  /** number of tokens per field */
  readonly fieldLengths: Readonly<Record<string, number>>;
  /** total tokens across all fields */
  readonly length: number;
}

export interface IndexStats {
  readonly documentCount: number;
  readonly termCount: number;
  readonly totalPostings: number;
  readonly averageDocumentLength: number;
}

interface MutablePosting {
  field: string;
  frequency: number;
  positions: number[];
}

export class InvertedIndex {
  private readonly tokenizer: Tokenizer;
  /** term -> docId -> posting */
  private readonly index: Map<string, Map<string, MutablePosting>>;
  private readonly documents: Map<string, IndexedDocument>;
  private totalLength: number;

  constructor(tokenizer?: Tokenizer) {
    this.tokenizer = tokenizer ?? new Tokenizer({ removeStopWords: true });
    this.index = new Map();
    this.documents = new Map();
    this.totalLength = 0;
  }

  /** Add or replace a document. Fields are indexed independently. */
  addDocument(id: string, fields: Record<string, string>): void {
    if (this.documents.has(id)) {
      this.removeDocument(id);
    }
    const fieldLengths: Record<string, number> = {};
    let total = 0;
    for (const [field, text] of Object.entries(fields)) {
      const tokens = this.tokenizer.tokenize(text);
      fieldLengths[field] = tokens.length;
      total += tokens.length;
      for (const token of tokens) {
        let bucket = this.index.get(token.term);
        if (bucket === undefined) {
          bucket = new Map();
          this.index.set(token.term, bucket);
        }
        let posting = bucket.get(id);
        if (posting === undefined) {
          posting = { field, frequency: 0, positions: [] };
          bucket.set(id, posting);
        }
        if (posting.field === field) {
          posting.frequency++;
          posting.positions.push(token.position);
        } else {
          // A term can appear in multiple fields; store one posting per
          // (term, doc, field) by keying the doc map with a composite.
          const compositeKey = `${id}\u0001${field}`;
          let composite = bucket.get(compositeKey);
          if (composite === undefined) {
            composite = { field, frequency: 0, positions: [] };
            bucket.set(compositeKey, composite);
          }
          composite.frequency++;
          composite.positions.push(token.position);
        }
      }
    }
    this.documents.set(id, { id, fields, fieldLengths, length: total });
    this.totalLength += total;
  }

  removeDocument(id: string): boolean {
    const doc = this.documents.get(id);
    if (doc === undefined) return false;
    for (const bucket of this.index.values()) {
      bucket.delete(id);
      // also remove composite field keys
      for (const key of [...bucket.keys()]) {
        if (key.startsWith(id + '\u0001')) bucket.delete(key);
      }
    }
    this.documents.delete(id);
    this.totalLength -= doc.length;
    return true;
  }

  /** Postings for a term. Composite keys are flattened to their base docId. */
  postings(term: string): Posting[] {
    const bucket = this.index.get(term);
    if (bucket === undefined) return [];
    const result: Posting[] = [];
    for (const [key, p] of bucket) {
      const docId = key.split('\u0001')[0];
      result.push({
        docId,
        field: p.field,
        frequency: p.frequency,
        positions: p.positions,
      });
    }
    return result;
  }

  /** Postings for a term restricted to a single field. */
  postingsForField(term: string, field: string): Posting[] {
    return this.postings(term).filter((p) => p.field === field);
  }

  /** Number of documents containing the term (across any field). */
  documentFrequency(term: string): number {
    const bucket = this.index.get(term);
    if (bucket === undefined) return 0;
    const docs = new Set<string>();
    for (const key of bucket.keys()) docs.add(key.split('\u0001')[0]);
    return docs.size;
  }

  termFrequency(term: string, docId: string, field?: string): number {
    return this.postings(term)
      .filter((p) => p.docId === docId && (field === undefined || p.field === field))
      .reduce((sum, p) => sum + p.frequency, 0);
  }

  positions(term: string, docId: string, field: string): readonly number[] {
    const bucket = this.index.get(term);
    if (bucket === undefined) return [];
    const posting = bucket.get(docId) ?? bucket.get(`${docId}\u0001${field}`);
    if (posting === undefined || posting.field !== field) return [];
    return posting.positions;
  }

  getDocument(id: string): IndexedDocument | undefined {
    return this.documents.get(id);
  }

  documentIds(): string[] {
    return [...this.documents.keys()];
  }

  documentLength(id: string, field?: string): number {
    const doc = this.documents.get(id);
    if (doc === undefined) return 0;
    if (field === undefined) return doc.length;
    return doc.fieldLengths[field] ?? 0;
  }

  averageFieldLength(field: string): number {
    if (this.documents.size === 0) return 0;
    let sum = 0;
    for (const doc of this.documents.values()) {
      sum += doc.fieldLengths[field] ?? 0;
    }
    return sum / this.documents.size;
  }

  averageDocumentLength(): number {
    return this.documents.size === 0 ? 0 : this.totalLength / this.documents.size;
  }

  vocabulary(): string[] {
    return [...this.index.keys()];
  }

  stats(): IndexStats {
    let postings = 0;
    for (const bucket of this.index.values()) postings += bucket.size;
    return {
      documentCount: this.documents.size,
      termCount: this.index.size,
      totalPostings: postings,
      averageDocumentLength: this.averageDocumentLength(),
    };
  }

  clear(): void {
    this.index.clear();
    this.documents.clear();
    this.totalLength = 0;
  }
}
