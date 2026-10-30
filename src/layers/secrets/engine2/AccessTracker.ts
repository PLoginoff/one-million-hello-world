/**
 * Secrets Engine2 — Usage Tracking (which service touched which secret)
 *
 * SecretAuditLog records every access as an entry; this module is the
 * AGGREGATED view ops teams actually query:
 *
 *   - `record(principal, path, action)` — feed from the audit pipeline or
 *     a wrapping provider; keeps per-(principal,path) counts, first/last
 *     seen, and per-action histograms.
 *   - `consumers(path)` — who reads this secret (decommission checklist).
 *   - `footprint(principal)` — which secrets a service touches (least-
 *     privilege review input).
 *   - `hotSecrets(n)` — most-accessed paths (cache-miss storm triage).
 *   - Time-windowed counts via `windowed(horizonMs)` — a sliding count
 *     backed by a per-key bucket ring (second-granularity buckets,
 *     O(buckets) per query, bounded memory).
 *
 * The tracker is in-memory: it complements, not replaces, the durable
 * audit log — queries here are statistical, not compliance-grade.
 *
 * Complexity: record O(1); queries O(keys) or O(top-n) via partial sort.
 *
 * @module Secrets/Engine2
 */

import { AuditAction, SecretsClock } from '../vault/SecretTypes';

interface PairStats {
  count: number;
  firstAt: number;
  lastAt: number;
  readonly actions: Map<AuditAction, number>;
}

/** Second-granularity ring of per-pair counts for sliding-window queries. */
interface BucketRing {
  readonly bucketMs: number;
  readonly buckets: Map<number, number>; // bucketIndex → count
}

export interface ConsumerInfo {
  readonly principal: string;
  readonly count: number;
  readonly firstAt: number;
  readonly lastAt: number;
}

export interface SecretFootprint {
  readonly path: string;
  readonly count: number;
  readonly lastAt: number;
  readonly topAction: AuditAction | null;
}

export interface AccessTrackerOptions {
  readonly clock?: SecretsClock;
  /** Sliding-window granularity (default 60s). */
  readonly bucketMs?: number;
  /** Retention for window queries — older buckets are dropped (default 1h). */
  readonly retentionMs?: number;
}

const BUCKET_MS = 60_000;
const RETENTION_MS = 3_600_000;

export class AccessTracker {
  private readonly _clock: SecretsClock;
  private readonly _bucketMs: number;
  private readonly _retentionMs: number;
  /** `${principal} ${path}` → aggregate. */
  private readonly _pairs = new Map<string, PairStats>();
  /** Same key → sliding-window ring. */
  private readonly _rings = new Map<string, BucketRing>();

  constructor(options?: AccessTrackerOptions) {
    this._clock = options?.clock ?? (() => Date.now());
    this._bucketMs = options?.bucketMs ?? BUCKET_MS;
    this._retentionMs = options?.retentionMs ?? RETENTION_MS;
  }

  private _key(principal: string, path: string): string {
    return `${principal} ${path}`;
  }

  record(principal: string, path: string, action: AuditAction): void {
    const key = this._key(principal, path);
    const now = this._clock();
    let p = this._pairs.get(key);
    if (!p) {
      p = { count: 0, firstAt: now, lastAt: now, actions: new Map() };
      this._pairs.set(key, p);
    }
    p.count++;
    p.lastAt = now;
    p.actions.set(action, (p.actions.get(action) ?? 0) + 1);

    let ring = this._rings.get(key);
    if (!ring) {
      ring = { bucketMs: this._bucketMs, buckets: new Map() };
      this._rings.set(key, ring);
    }
    const b = Math.floor(now / this._bucketMs);
    ring.buckets.set(b, (ring.buckets.get(b) ?? 0) + 1);
    // Drop buckets beyond retention.
    const cutoff = Math.floor((now - this._retentionMs) / this._bucketMs);
    for (const k of ring.buckets.keys()) {
      if (k < cutoff) ring.buckets.delete(k);
    }
  }

  /** Principals accessing `path`, most frequent first. */
  consumers(path: string): ConsumerInfo[] {
    const out: ConsumerInfo[] = [];
    for (const [key, p] of this._pairs) {
      const sep = key.indexOf(' ');
      if (sep < 0 || key.slice(sep + 1) !== path) continue;
      out.push({ principal: key.slice(0, sep), count: p.count, firstAt: p.firstAt, lastAt: p.lastAt });
    }
    return out.sort((a, b) => b.count - a.count);
  }

  /** Every path `principal` has touched. */
  footprint(principal: string): SecretFootprint[] {
    const out: SecretFootprint[] = [];
    for (const [key, p] of this._pairs) {
      const sep = key.indexOf(' ');
      if (key.slice(0, sep) !== principal) continue;
      let top: AuditAction | null = null;
      let topN = -1;
      for (const [a, n] of p.actions) {
        if (n > topN) {
          top = a;
          topN = n;
        }
      }
      out.push({ path: key.slice(sep + 1), count: p.count, lastAt: p.lastAt, topAction: top });
    }
    return out.sort((a, b) => b.count - a.count);
  }

  /** Access count within the last `horizonMs` (defaults to retention). */
  windowed(principal: string, path: string, horizonMs?: number): number {
    const ring = this._rings.get(this._key(principal, path));
    if (!ring) return 0;
    const horizon = horizonMs ?? this._retentionMs;
    const cutoff = Math.floor((this._clock() - horizon) / this._bucketMs);
    let n = 0;
    for (const [b, c] of ring.buckets) {
      if (b >= cutoff) n += c;
    }
    return n;
  }

  /** Top-N most-accessed (path, principal) pairs globally. */
  hotSecrets(n: number): Array<{ principal: string; path: string; count: number }> {
    const all = [...this._pairs.entries()].map(([key, p]) => {
      const sep = key.indexOf(' ');
      return { principal: key.slice(0, sep), path: key.slice(sep + 1), count: p.count };
    });
    return all.sort((a, b) => b.count - a.count).slice(0, n);
  }

  /** Count distinct principals (cardinality report). */
  principalCount(): number {
    return new Set([...this._pairs.keys()].map((k) => k.slice(0, k.indexOf(' ')))).size;
  }
}
