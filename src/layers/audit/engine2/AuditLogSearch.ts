/**
 * Audit Log Full-Text Search
 *
 * BM25-inspired relevance scoring over audit records. The index holds
 * per-record token multisets built lazily at search time (in-memory,
 * re-indexed on each call — the store is append-only so this is O(n)
 * per query; swap in a persistent index when logs outgrow memory).
 *
 * Scoring: standard BM25 with k1=1.2, b=0.75 over fields actor, action,
 * resource, resourceType, outcome, severity and stringified details.
 * Phrase queries ("..."-quoted) get a positional bonus.
 *
 * @module AuditLayer/Engine2
 */

import type { AuditRecord } from '../engine/types';
import { SEVERITY_ORDER } from '../engine/types';

export interface SearchHit {
  readonly record: AuditRecord;
  readonly score: number;
  /** Tokens that contributed to the hit. */
  readonly matchedTerms: readonly string[];
}

export interface SearchOptions {
  readonly fromMs?: number;
  readonly toMs?: number;
  /** Restrict to a tenant. */
  readonly tenant?: string;
  /** Minimum severity. */
  readonly minSeverity?: string;
  /** Cap on returned hits (default 50). */
  readonly limit?: number;
  /** Minimum BM25 score to include (default 0). */
  readonly minScore?: number;
}

const BM25_K1 = 1.2;
const BM25_B = 0.75;

/** Field weights — action and actor weigh more than free-form details. */
const FIELD_WEIGHTS: ReadonlyArray<{ name: string; weight: number }> = [
  { name: 'action', weight: 3 },
  { name: 'actor', weight: 2.5 },
  { name: 'resource', weight: 2 },
  { name: 'resourceType', weight: 1.5 },
  { name: 'outcome', weight: 1 },
  { name: 'severity', weight: 0.5 },
  { name: 'details', weight: 0.5 },
];

function tokenize(text: string): string[] {
  // Split on punctuation INCLUDING `.` and `:` so `auth.login` yields
  // both `auth` and `login` — dotted action names should be searchable
  // by any of their segments. Phrase queries bypass this via raw-text
  // matching, so `document:99` is still findable verbatim.
  return text
    .toLowerCase()
    .split(/[^a-z0-9_*-]+/)
    .filter((t) => t.length > 0);
}

function flattenDetails(details: Record<string, unknown>): string {
  const parts: string[] = [];
  const walk = (v: unknown): void => {
    if (v === null || v === undefined) return;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      parts.push(String(v));
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (typeof v === 'object') {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        parts.push(k);
        walk(val);
      }
    }
  };
  walk(details);
  return parts.join(' ');
}

interface DocTerms {
  /** term → weighted frequency (sum of field weights where term occurs). */
  freq: Map<string, number>;
  /** Document length in weighted tokens. */
  length: number;
  /** Raw tokens for phrase checks. */
  raw: readonly string[];
}

function extractDoc(record: AuditRecord): DocTerms {
  const freq = new Map<string, number>();
  let length = 0;
  const rawParts: string[] = [];

  const fields: Record<string, string> = {
    action: record.action,
    actor: record.actor,
    resource: record.resource ?? '',
    resourceType: record.resourceType ?? '',
    outcome: record.outcome,
    severity: record.severity,
    details: flattenDetails(record.details),
  };

  for (const { name, weight } of FIELD_WEIGHTS) {
    const toks = tokenize(fields[name] ?? '');
    rawParts.push(fields[name] ?? '');
    for (const t of toks) {
      freq.set(t, (freq.get(t) ?? 0) + weight);
      length += weight;
    }
  }

  return { freq, length, raw: rawParts };
}

interface ParsedQuery {
  readonly terms: readonly string[];
  readonly phrases: readonly string[];
}

/** Parse `foo bar "exact phrase"` into terms + phrases. */
export function parseSearchQuery(q: string): ParsedQuery {
  const phrases: string[] = [];
  const rest = q.replace(/"([^"]*)"/g, (_m, p1: string) => {
    phrases.push(p1.toLowerCase());
    return ' ';
  });
  const terms = tokenize(rest);
  return { terms, phrases };
}

/**
 * Stateless scorer — call `search` with the record set each time.
 */
export class AuditLogSearch {
  /**
   * Score `records` against `queryText`. Returns hits sorted by score
   * desc, then seq desc (recent first on ties).
   */
  search(records: readonly AuditRecord[], queryText: string, opts?: SearchOptions): SearchHit[] {
    const { terms, phrases } = parseSearchQuery(queryText);
    if (terms.length === 0 && phrases.length === 0) return [];

    const filtered = records.filter(
      (r) =>
        (opts?.fromMs === undefined || r.timestamp >= opts.fromMs) &&
        (opts?.toMs === undefined || r.timestamp <= opts.toMs) &&
        (opts?.tenant === undefined || r.tenant === opts.tenant) &&
        (opts?.minSeverity === undefined ||
          SEVERITY_ORDER[r.severity] >=
            SEVERITY_ORDER[opts.minSeverity as keyof typeof SEVERITY_ORDER])
    );
    if (filtered.length === 0) return [];

    const docs = filtered.map(extractDoc);
    const n = filtered.length;
    const avgLen = docs.reduce((s, d) => s + d.length, 0) / Math.max(1, n);

    // Document frequency per term (a term counts once per doc no matter
    // how often it repeats — classic IDF).
    const df = new Map<string, number>();
    for (const d of docs) {
      for (const t of terms) {
        if (d.freq.has(t)) df.set(t, (df.get(t) ?? 0) + 1);
      }
    }

    const idf = (t: string): number => {
      const d = df.get(t) ?? 0;
      // Robertson's IDF — floored at 0 so ubiquitous terms don't go negative.
      return Math.max(0, Math.log(1 + (n - d + 0.5) / (d + 0.5)));
    };

    const hits: SearchHit[] = [];
    for (let i = 0; i < n; i++) {
      const d = docs[i];
      let score = 0;
      const matched: string[] = [];
      for (const t of terms) {
        const f = d.freq.get(t) ?? 0;
        if (f === 0) continue;
        const norm = f * (BM25_K1 + 1);
        const denom = f + BM25_K1 * (1 - BM25_B + (BM25_B * d.length) / Math.max(avgLen, 1e-9));
        score += idf(t) * (norm / denom);
        matched.push(t);
      }
      // Phrase bonus: each phrase found verbatim in any field's raw text.
      for (const p of phrases) {
        if (d.raw.some((fieldText) => fieldText.toLowerCase().includes(p))) {
          score += 2.0; // fixed bonus — phrases are high-precision signals
          matched.push(`"${p}"`);
        }
      }
      if (score > (opts?.minScore ?? 0)) {
        hits.push({ record: filtered[i], score, matchedTerms: matched });
      }
    }

    hits.sort((a, b) => b.score - a.score || b.record.seq - a.record.seq);
    return hits.slice(0, opts?.limit ?? 50);
  }
}
