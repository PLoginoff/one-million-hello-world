/**
 * Error Clustering by Signature
 *
 * Groups DLQ records by a normalised error signature so operators see
 * "47 of the same failure" instead of 47 rows. Two records share a
 * cluster when their signatures match — the signature is the error
 * class, the crash site, and a *normalised* message: digits, UUIDs,
 * hex runs, quoted strings and whitespace are folded to placeholders
 * so "order 88123 timed out" and "order 91047 timed out" collapse.
 *
 * Normalisation order matters — longest/most-specific patterns first:
 *
 *   1. lowercase
 *   2. UUIDs → `<uuid>`
 *   3. quoted spans → `<str>`
 *   4. hex runs (≥8 chars, e.g. object ids) → `<hex>`
 *   5. digit runs → `<n>`
 *   6. whitespace runs → single space
 *
 * The signature format is `class@site:message` with missing parts
 * dropped (`class:message`, `class@site`, `class`, `message`,
 * `unknown` when there is nothing). Stable, comparable, greppable.
 *
 * Clustering is single-pass O(R) — a Map keyed on the signature. No
 * similarity scoring: fuzzy clustering (Levenshtein, minhash) would
 * merge distinct faults; the normaliser is the precision knob.
 *
 * @module DeadLetterLayer/Engine2
 */

import { Engine2Record, ReasonCount, ReasonReport } from './types';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const QUOTED_RE = /"[^"]*"|'[^']*'|`[^`]*`/g;
const HEX_RE = /\b0x[0-9a-f]+\b|\b[0-9a-f]{8,}\b/g;
const DIGITS_RE = /\d+/g;
const SPACE_RE = /\s+/g;

/** Normalise a raw error message into a cluster-stable token string. */
export function normalizeMessage(raw: string): string {
  return raw
    .toLowerCase()
    .replace(UUID_RE, '<uuid>')
    .replace(QUOTED_RE, '<str>')
    .replace(HEX_RE, '<hex>')
    .replace(DIGITS_RE, '<n>')
    .replace(SPACE_RE, ' ')
    .trim();
}

/** The cluster key for one record. */
export function signatureOf(
  record: Pick<Engine2Record, 'errorClass' | 'errorMessage' | 'errorSite'>
): string {
  const cls = record.errorClass || 'unknown';
  const msg = normalizeMessage(record.errorMessage || '');
  const site = record.errorSite || '';
  const head = site ? `${cls}@${site}` : cls;
  return msg ? `${head}:${msg}` : head;
}

export interface ClusterMember {
  readonly recordId: string;
  readonly failedAt: number;
}

export interface Cluster {
  readonly signature: string;
  readonly count: number;
  /** Members in ascending failedAt order. */
  readonly members: readonly ClusterMember[];
  readonly firstSeenAt: number;
  readonly lastSeenAt: number;
  /** Distinct origins feeding this cluster. */
  readonly origins: readonly string[];
}

/** Single-pass clustering over a record set. */
export function clusterRecords(
  records: readonly Pick<Engine2Record, 'id' | 'origin' | 'failedAt' | 'errorClass' | 'errorMessage' | 'errorSite'>[]
): Cluster[] {
  const bySig = new Map<
    string,
    {
      members: ClusterMember[];
      first: number;
      last: number;
      origins: Set<string>;
    }
  >();
  for (const r of records) {
    const sig = signatureOf(r);
    let c = bySig.get(sig);
    if (!c) {
      c = { members: [], first: r.failedAt, last: r.failedAt, origins: new Set() };
      bySig.set(sig, c);
    }
    c.members.push({ recordId: r.id, failedAt: r.failedAt });
    if (r.failedAt < c.first) c.first = r.failedAt;
    if (r.failedAt > c.last) c.last = r.failedAt;
    c.origins.add(r.origin);
  }
  return [...bySig.entries()]
    .map(([signature, c]) => ({
      signature,
      count: c.members.length,
      members: c.members,
      firstSeenAt: c.first,
      lastSeenAt: c.last,
      origins: [...c.origins],
    }))
    .sort((a, b) => b.count - a.count || a.signature.localeCompare(b.signature));
}

// ---------------------------------------------------------------------------
// Top-failure-reasons report
// ---------------------------------------------------------------------------

export type ReasonGroupBy = 'class' | 'signature';

/**
 * Top-N failure reasons for one queue's record set. `groupBy='class'`
 * buckets on `errorClass` (coarse); `'signature'` buckets on the
 * normalised signature (fine). Buckets sort by count desc, then most
 * recent failure desc — the two orderings an operator scans.
 */
export function topReasons(
  queue: string,
  records: readonly Pick<Engine2Record, 'errorClass' | 'errorMessage' | 'errorSite' | 'failedAt'>[],
  groupBy: ReasonGroupBy = 'signature',
  limit = 10
): ReasonReport {
  const buckets = new Map<string, { count: number; last: number }>();
  for (const r of records) {
    const key = groupBy === 'class' ? r.errorClass || 'unknown' : signatureOf(r);
    const b = buckets.get(key) ?? { count: 0, last: 0 };
    b.count++;
    if (r.failedAt > b.last) b.last = r.failedAt;
    buckets.set(key, b);
  }
  const all = [...buckets.entries()]
    .map(([key, b]) => ({ key, count: b.count, lastSeenAt: b.last }))
    .sort((a, b) => b.count - a.count || b.lastSeenAt - a.lastSeenAt);

  const analysed = records.length;
  const top: ReasonCount[] = all.slice(0, limit).map((b) => ({
    key: b.key,
    count: b.count,
    share: analysed === 0 ? 0 : b.count / analysed,
    lastSeenAt: b.lastSeenAt,
  }));
  const remainder = all.slice(limit).reduce((n, b) => n + b.count, 0);
  return { queue, analysed, top, remainder };
}
