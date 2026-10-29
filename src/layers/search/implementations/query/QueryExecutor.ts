/**
 * QueryExecutor
 *
 * Executes parsed QueryNode trees against an InvertedIndex, producing
 * BM25-scored hits. Supports term, fuzzy term, phrase (with slop),
 * boolean must/should/must_not, field restriction, field boosts, and
 * match_all.
 */

import { InvertedIndex } from '../index/InvertedIndex';
import { bm25TermScore, Bm25Params, DEFAULT_BM25 } from '../index/Scoring';
import { fuzzyExpand } from '../index/FuzzyMatch';
import { QueryNode } from './QueryAst';

export interface SearchHit {
  readonly docId: string;
  readonly score: number;
  /** which fields contributed to the match */
  readonly matchedFields: readonly string[];
  /** matched terms (for highlighting) */
  readonly matchedTerms: readonly string[];
}

export interface ExecuteOptions {
  /** per-field boost multipliers */
  readonly fieldBoosts?: Readonly<Record<string, number>>;
  /** restrict to these fields; undefined = all fields */
  readonly fields?: readonly string[];
  readonly bm25?: Bm25Params;
  readonly limit?: number;
  readonly offset?: number;
  /** minimum score threshold */
  readonly minScore?: number;
}

interface ScoreAccumulator {
  score: number;
  fields: Set<string>;
  terms: Set<string>;
}

export class QueryExecutor {
  private readonly index: InvertedIndex;
  private readonly bm25: Bm25Params;

  constructor(index: InvertedIndex, bm25: Bm25Params = DEFAULT_BM25) {
    this.index = index;
    this.bm25 = bm25;
  }

  execute(query: QueryNode, options: ExecuteOptions = {}): SearchHit[] {
    const acc = new Map<string, ScoreAccumulator>();
    this.evalNode(query, acc, options);
    const minScore = options.minScore ?? 0;
    const hits: SearchHit[] = [];
    for (const [docId, a] of acc) {
      if (a.score < minScore) continue;
      hits.push({
        docId,
        score: a.score,
        matchedFields: [...a.fields],
        matchedTerms: [...a.terms],
      });
    }
    hits.sort((x, y) => y.score - x.score || x.docId.localeCompare(y.docId));
    const offset = options.offset ?? 0;
    const limit = options.limit ?? hits.length;
    return hits.slice(offset, offset + limit);
  }

  private evalNode(
    node: QueryNode,
    acc: Map<string, ScoreAccumulator>,
    options: ExecuteOptions,
    restrictField?: string
  ): void {
    switch (node.kind) {
      case 'match_all':
        this.evalMatchAll(node.boost, acc);
        return;
      case 'term':
        this.evalTerm(node.term, node.fuzziness, node.boost, acc, options, restrictField);
        return;
      case 'phrase':
        this.evalPhrase(node.terms, node.slop, node.boost, acc, options, restrictField);
        return;
      case 'field':
        this.evalNode(node.query, acc, options, node.field);
        return;
      case 'boolean':
        this.evalBoolean(node, acc, options, restrictField);
        return;
    }
  }

  private evalMatchAll(boost: number, acc: Map<string, ScoreAccumulator>): void {
    for (const docId of this.index.documentIds()) {
      const a = this.getAcc(acc, docId);
      a.score += boost;
    }
  }

  private targetFields(options: ExecuteOptions, restrictField?: string): string[] {
    if (restrictField !== undefined) return [restrictField];
    if (options.fields !== undefined) return [...options.fields];
    // all fields present in the index
    const fields = new Set<string>();
    for (const docId of this.index.documentIds()) {
      const doc = this.index.getDocument(docId);
      if (doc !== undefined) {
        for (const f of Object.keys(doc.fields)) fields.add(f);
      }
    }
    return [...fields];
  }

  private fieldBoost(field: string, options: ExecuteOptions): number {
    return options.fieldBoosts?.[field] ?? 1;
  }

  private evalTerm(
    term: string,
    fuzziness: number,
    boost: number,
    acc: Map<string, ScoreAccumulator>,
    options: ExecuteOptions,
    restrictField?: string
  ): void {
    const total = this.index.stats().documentCount;
    const fields = this.targetFields(options, restrictField);
    // fuzzy expansion: terms within edit distance
    const expansion: Array<{ term: string; sim: number }> = [{ term, sim: 1 }];
    if (fuzziness > 0) {
      for (const c of fuzzyExpand(term, this.index.vocabulary(), { maxEdits: fuzziness })) {
        if (c.term !== term) expansion.push({ term: c.term, sim: c.score });
      }
    }
    for (const { term: t, sim } of expansion) {
      const df = this.index.documentFrequency(t);
      if (df === 0) continue;
      for (const field of fields) {
        const fBoost = this.fieldBoost(field, options);
        const avgLen = this.index.averageFieldLength(field);
        for (const posting of this.index.postingsForField(t, field)) {
          const docLen = this.index.documentLength(posting.docId, field);
          const score =
            bm25TermScore(posting.frequency, df, total, docLen, avgLen, this.bm25) *
            boost *
            fBoost *
            sim;
          if (score <= 0) continue;
          const a = this.getAcc(acc, posting.docId);
          a.score += score;
          a.fields.add(field);
          a.terms.add(t);
        }
      }
    }
  }

  private evalPhrase(
    terms: readonly string[],
    slop: number,
    boost: number,
    acc: Map<string, ScoreAccumulator>,
    options: ExecuteOptions,
    restrictField?: string
  ): void {
    if (terms.length === 0) return;
    const fields = this.targetFields(options, restrictField);
    for (const field of fields) {
      const fBoost = this.fieldBoost(field, options);
      // candidate docs = docs containing all terms in this field
      let candidates: Set<string> | null = null;
      for (const term of terms) {
        const docs = new Set(this.index.postingsForField(term, field).map((p) => p.docId));
        if (candidates === null) {
          candidates = docs;
        } else {
          for (const d of candidates) {
            if (!docs.has(d)) candidates.delete(d);
          }
        }
      }
      if (candidates === null) continue;
      for (const docId of candidates) {
        const matchQuality = this.phraseMatch(terms, docId, field, slop);
        if (matchQuality <= 0) continue;
        // score: sum of per-term BM25, scaled by phrase tightness
        const total = this.index.stats().documentCount;
        const avgLen = this.index.averageFieldLength(field);
        const docLen = this.index.documentLength(docId, field);
        let score = 0;
        for (const term of new Set(terms)) {
          const tf = this.index.termFrequency(term, docId, field);
          const df = this.index.documentFrequency(term);
          score += bm25TermScore(tf, df, total, docLen, avgLen, this.bm25);
        }
        score *= matchQuality * boost * fBoost;
        const a = this.getAcc(acc, docId);
        a.score += score;
        a.fields.add(field);
        for (const t of terms) a.terms.add(t);
      }
    }
  }

  /**
   * Check whether `terms` occur in `docId`/`field` as a phrase within `slop`.
   * Returns a quality factor in (0,1]: exact ordered match = 1, looser
   * matches degrade toward 0.
   */
  private phraseMatch(
    terms: readonly string[],
    docId: string,
    field: string,
    slop: number
  ): number {
    const positionLists: readonly (readonly number[])[] = terms.map((t) =>
      this.index.positions(t, docId, field)
    );
    for (const list of positionLists) {
      if (list.length === 0) return 0;
    }
    // For each start position of the first term, try to align subsequent
    // terms greedily and compute total slack.
    let bestSlack: number | null = null;
    for (const start of positionLists[0]) {
      let slack = 0;
      let expected = start + 1;
      let ok = true;
      for (let i = 1; i < terms.length; i++) {
        // find smallest position >= expected
        const found = positionLists[i].find((p) => p >= expected);
        if (found === undefined) {
          // try exact expected position
          if (positionLists[i].includes(expected)) {
            // unreachable, but safe
          } else {
            ok = false;
            break;
          }
        }
        if (found !== undefined) {
          slack += found - expected;
          expected = found + 1;
        }
      }
      if (ok && (bestSlack === null || slack < bestSlack)) {
        bestSlack = slack;
      }
    }
    if (bestSlack === null || bestSlack > slop) return 0;
    // quality: exact = 1, decays with slack
    return 1 / (1 + bestSlack);
  }

  private evalBoolean(
    node: Extract<QueryNode, { kind: 'boolean' }>,
    acc: Map<string, ScoreAccumulator>,
    options: ExecuteOptions,
    restrictField?: string
  ): void {
    const mustAccs: Map<string, ScoreAccumulator>[] = [];
    const shouldAccs: Map<string, ScoreAccumulator>[] = [];
    const excluded = new Set<string>();
    for (const clause of node.clauses) {
      const sub = new Map<string, ScoreAccumulator>();
      this.evalNode(clause.query, sub, options, restrictField);
      if (clause.occur === 'must') {
        mustAccs.push(sub);
      } else if (clause.occur === 'should') {
        shouldAccs.push(sub);
      } else {
        for (const docId of sub.keys()) excluded.add(docId);
      }
    }
    // docs matching ALL must clauses
    let survivors: Set<string>;
    if (mustAccs.length === 0) {
      survivors = new Set<string>();
      for (const sub of shouldAccs) {
        for (const d of sub.keys()) survivors.add(d);
      }
      // pure NOT query: all docs except excluded
      if (shouldAccs.length === 0) {
        survivors = new Set(this.index.documentIds());
      }
    } else {
      survivors = new Set(mustAccs[0].keys());
      for (let i = 1; i < mustAccs.length; i++) {
        for (const d of survivors) {
          if (!mustAccs[i].has(d)) survivors.delete(d);
        }
      }
    }
    for (const d of excluded) survivors.delete(d);
    for (const docId of survivors) {
      const a = this.getAcc(acc, docId);
      let score = 0;
      for (const sub of mustAccs) {
        const s = sub.get(docId);
        if (s !== undefined) {
          score += s.score;
          for (const f of s.fields) a.fields.add(f);
          for (const t of s.terms) a.terms.add(t);
        }
      }
      for (const sub of shouldAccs) {
        const s = sub.get(docId);
        if (s !== undefined) {
          score += s.score;
          for (const f of s.fields) a.fields.add(f);
          for (const t of s.terms) a.terms.add(t);
        }
      }
      a.score += score * node.boost;
    }
  }

  private getAcc(acc: Map<string, ScoreAccumulator>, docId: string): ScoreAccumulator {
    let a = acc.get(docId);
    if (a === undefined) {
      a = { score: 0, fields: new Set(), terms: new Set() };
      acc.set(docId, a);
    }
    return a;
  }
}
