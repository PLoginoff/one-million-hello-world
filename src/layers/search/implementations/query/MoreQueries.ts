/**
 * MoreQueries
 *
 * Additional query types evaluated against the index and DocValues:
 * prefix, wildcard (regex-compiled), and numeric range queries, plus a
 * disjunction-max combinator and a boosting query.
 */

import { QueryNode } from './QueryAst';
import { InvertedIndex } from '../index/InvertedIndex';
import { DocValues } from '../facets/DocValues';
import { bm25TermScore, Bm25Params, DEFAULT_BM25 } from '../index/Scoring';
import { SearchHit, QueryExecutor } from './QueryExecutor';

export type ExtendedQueryNode =
  | QueryNode
  | PrefixQuery
  | WildcardQuery
  | RangeQuery
  | DisMaxQuery
  | BoostingQuery;

export interface PrefixQuery {
  readonly kind: 'prefix';
  readonly field?: string;
  readonly prefix: string;
  readonly boost: number;
}

export interface WildcardQuery {
  readonly kind: 'wildcard';
  readonly field?: string;
  /** pattern with * and ? */
  readonly pattern: string;
  readonly boost: number;
}

export interface RangeQuery {
  readonly kind: 'range';
  readonly field: string;
  readonly min?: number;
  readonly max?: number;
  readonly minExclusive?: boolean;
  readonly maxExclusive?: boolean;
}

export interface DisMaxQuery {
  readonly kind: 'dismax';
  readonly queries: readonly QueryNode[];
  /** tie-breaker: fraction of non-max scores added */
  readonly tie: number;
}

export interface BoostingQuery {
  readonly kind: 'boosting';
  readonly positive: QueryNode;
  readonly negative: QueryNode;
  /** factor in (0,1) applied to negative-doc scores */
  readonly negativeBoost: number;
}

export function prefixQuery(prefix: string, field?: string, boost = 1): PrefixQuery {
  return { kind: 'prefix', prefix: prefix.toLowerCase(), field, boost };
}

export function wildcardQuery(pattern: string, field?: string, boost = 1): WildcardQuery {
  return { kind: 'wildcard', pattern: pattern.toLowerCase(), field, boost };
}

export function rangeQuery(
  field: string,
  range: { min?: number; max?: number; minExclusive?: boolean; maxExclusive?: boolean }
): RangeQuery {
  return { kind: 'range', field, ...range };
}

export function disMaxQuery(queries: readonly QueryNode[], tie = 0.1): DisMaxQuery {
  return { kind: 'dismax', queries, tie };
}

export function boostingQuery(
  positive: QueryNode,
  negative: QueryNode,
  negativeBoost = 0.5
): BoostingQuery {
  return { kind: 'boosting', positive, negative, negativeBoost };
}

/** Compile a glob pattern (* and ?) into a RegExp. */
export function wildcardToRegex(pattern: string): RegExp {
  let re = '^';
  for (const ch of pattern) {
    if (ch === '*') re += '.*';
    else if (ch === '?') re += '.';
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(re + '$');
}

/**
 * Extended executor for non-BM25 query shapes. Uses the base executor
 * for standard nodes.
 */
export class ExtendedQueryExecutor {
  private readonly index: InvertedIndex;
  private readonly docValues: DocValues | undefined;
  private readonly bm25: Bm25Params;

  constructor(index: InvertedIndex, docValues?: DocValues, bm25: Bm25Params = DEFAULT_BM25) {
    this.index = index;
    this.docValues = docValues;
    this.bm25 = bm25;
  }

  execute(query: ExtendedQueryNode): SearchHit[] {
    switch (query.kind) {
      case 'prefix':
        return this.execPrefix(query);
      case 'wildcard':
        return this.execWildcard(query);
      case 'range':
        return this.execRange(query);
      case 'dismax':
        return this.execDisMax(query);
      case 'boosting':
        return this.execBoosting(query);
      default:
        return this.execStandard(query);
    }
  }

  private execStandard(query: QueryNode): SearchHit[] {
    return new QueryExecutor(this.index, this.bm25).execute(query);
  }

  private scoreDocsForTerm(
    term: string,
    field: string | undefined,
    boost: number,
    similarityScale = 1
  ): SearchHit[] {
    const total = this.index.stats().documentCount;
    const df = this.index.documentFrequency(term);
    if (df === 0) return [];
    const out: SearchHit[] = [];
    const fields =
      field !== undefined
        ? [field]
        : [...new Set(this.index.postings(term).map((p) => p.field))];
    const acc = new Map<string, { score: number; fields: Set<string> }>();
    for (const f of fields) {
      const avg = this.index.averageFieldLength(f);
      for (const p of this.index.postingsForField(term, f)) {
        const len = this.index.documentLength(p.docId, f);
        const s =
          bm25TermScore(p.frequency, df, total, len, avg, this.bm25) *
          boost *
          similarityScale;
        if (s <= 0) continue;
        const a = acc.get(p.docId) ?? { score: 0, fields: new Set<string>() };
        a.score += s;
        a.fields.add(f);
        acc.set(p.docId, a);
      }
    }
    for (const [docId, a] of acc) {
      out.push({ docId, score: a.score, matchedFields: [...a.fields], matchedTerms: [term] });
    }
    out.sort((x, y) => y.score - x.score);
    return out;
  }

  private execPrefix(q: PrefixQuery): SearchHit[] {
    const hits: SearchHit[] = [];
    const seen = new Map<string, SearchHit>();
    for (const term of this.index.vocabulary()) {
      if (!term.startsWith(q.prefix)) continue;
      for (const h of this.scoreDocsForTerm(term, q.field, q.boost)) {
        const existing = seen.get(h.docId);
        if (existing === undefined) {
          seen.set(h.docId, { ...h });
          hits.push(seen.get(h.docId)!);
        } else {
          seen.set(h.docId, {
            docId: h.docId,
            score: existing.score + h.score,
            matchedFields: [...new Set([...existing.matchedFields, ...h.matchedFields])],
            matchedTerms: [...new Set([...existing.matchedTerms, ...h.matchedTerms])],
          });
        }
      }
    }
    const merged = [...seen.values()];
    merged.sort((a, b) => b.score - a.score);
    return merged;
  }

  private execWildcard(q: WildcardQuery): SearchHit[] {
    const re = wildcardToRegex(q.pattern);
    const seen = new Map<string, SearchHit>();
    for (const term of this.index.vocabulary()) {
      if (!re.test(term)) continue;
      for (const h of this.scoreDocsForTerm(term, q.field, q.boost)) {
        const existing = seen.get(h.docId);
        seen.set(h.docId, {
          docId: h.docId,
          score: (existing?.score ?? 0) + h.score,
          matchedFields: [...new Set([...(existing?.matchedFields ?? []), ...h.matchedFields])],
          matchedTerms: [...new Set([...(existing?.matchedTerms ?? []), ...h.matchedTerms])],
        });
      }
    }
    return [...seen.values()].sort((a, b) => b.score - a.score);
  }

  private execRange(q: RangeQuery): SearchHit[] {
    if (this.docValues === undefined) return [];
    let ids = this.docValues.rangeFilter(q.field, q.min, q.max);
    const dv = this.docValues;
    if (q.minExclusive === true && q.min !== undefined) {
      const min = q.min;
      ids = new Set([...ids].filter((id) => (dv.getNumber(id, q.field) ?? -Infinity) > min));
    }
    if (q.maxExclusive === true && q.max !== undefined) {
      const max = q.max;
      ids = new Set([...ids].filter((id) => (dv.getNumber(id, q.field) ?? Infinity) < max));
    }
    return [...ids].map((docId) => ({
      docId,
      score: 1,
      matchedFields: [q.field],
      matchedTerms: [],
    }));
  }

  private execDisMax(q: DisMaxQuery): SearchHit[] {
    const perQuery = q.queries.map((sub) => {
      const hits = this.execStandard(sub);
      return new Map(hits.map((h) => [h.docId, h]));
    });
    const allIds = new Set<string>();
    for (const m of perQuery) for (const id of m.keys()) allIds.add(id);
    const out: SearchHit[] = [];
    for (const docId of allIds) {
      let max = 0;
      let others = 0;
      const fields = new Set<string>();
      const terms = new Set<string>();
      for (const m of perQuery) {
        const h = m.get(docId);
        if (h === undefined) continue;
        if (h.score > max) {
          others += max;
          max = h.score;
        } else {
          others += h.score;
        }
        for (const f of h.matchedFields) fields.add(f);
        for (const t of h.matchedTerms) terms.add(t);
      }
      out.push({
        docId,
        score: max + q.tie * others,
        matchedFields: [...fields],
        matchedTerms: [...terms],
      });
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  }

  private execBoosting(q: BoostingQuery): SearchHit[] {
    const positive = this.execStandard(q.positive);
    const negative = new Set(this.execStandard(q.negative).map((h) => h.docId));
    return positive.map((h) => ({
      ...h,
      score: negative.has(h.docId) ? h.score * q.negativeBoost : h.score,
    }));
  }
}
