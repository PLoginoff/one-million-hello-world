/**
 * Audit Session Correlator
 *
 * Reconstructs user sessions and causal chains from raw audit records.
 * Two grouping strategies:
 *
 *  - `correlate` — group records sharing a correlationId into a causal
 *    chain (ordered by seq); answers "what did this request do?"
 *  - `sessions` — bucket an actor's activity into sessions split by an
 *    inactivity gap; answers "what did the user do during this visit?"
 *
 * Sessions carry derived stats: span, action histogram, failure count —
 * the primitives anomaly triage and insider-threat review consume.
 *
 * Complexity: O(n log n) dominated by the per-actor sort; grouping is
 * a single pass.
 *
 * @module AuditLayer/Engine2
 */

import type { AuditRecord, AuditSeverity } from '../engine/types';
import { SEVERITY_ORDER } from '../engine/types';

/** A causal chain — all records under one correlationId, seq-ordered. */
export interface CorrelationChain {
  readonly correlationId: string;
  readonly records: readonly AuditRecord[];
  readonly actors: readonly string[];
  readonly actions: readonly string[];
  readonly failures: number;
  readonly startedAt: number;
  readonly endedAt: number;
}

export interface Session {
  readonly actor: string;
  readonly sessionIndex: number;
  readonly records: readonly AuditRecord[];
  readonly startedAt: number;
  readonly endedAt: number;
  readonly durationMs: number;
  readonly failures: number;
  /** Highest severity observed. */
  readonly maxSeverity: AuditSeverity;
  /** action → count, most frequent first. */
  readonly topActions: readonly { action: string; count: number }[];
}

export interface CorrelatorOptions {
  /** Inactivity gap splitting sessions (default 30 min). */
  readonly gapMs?: number;
  /** Cap records per chain/session in results (0 = unlimited). */
  readonly maxRecords?: number;
}

const DEFAULT_GAP_MS = 30 * 60_000;

export class SessionCorrelator {
  private readonly _gapMs: number;
  private readonly _maxRecords: number;

  constructor(options?: CorrelatorOptions) {
    this._gapMs = options?.gapMs ?? DEFAULT_GAP_MS;
    this._maxRecords = options?.maxRecords ?? 0;
  }

  /**
   * Group records by correlationId into ordered chains. Records
   * without a correlationId are skipped — they form no chain.
   */
  correlate(records: readonly AuditRecord[]): CorrelationChain[] {
    const byId = new Map<string, AuditRecord[]>();
    for (const r of records) {
      if (r.correlationId === undefined) continue;
      const list = byId.get(r.correlationId) ?? [];
      list.push(r);
      byId.set(r.correlationId, list);
    }
    const chains: CorrelationChain[] = [];
    for (const [id, rs] of byId) {
      rs.sort((a, b) => a.seq - b.seq);
      chains.push(this.buildChain(id, rs));
    }
    return chains.sort((a, b) => a.startedAt - b.startedAt);
  }

  /** Records for one correlation id — common incident-triage call. */
  chainFor(records: readonly AuditRecord[], correlationId: string): CorrelationChain | null {
    const rs = records.filter((r) => r.correlationId === correlationId);
    if (rs.length === 0) return null;
    rs.sort((a, b) => a.seq - b.seq);
    return this.buildChain(correlationId, rs);
  }

  /**
   * Split one actor's records into sessions at inactivity gaps.
   * Records MUST be seq-sorted for deterministic results — we sort
   * defensively since callers may hand query results in desc order.
   */
  sessionsFor(actor: string, records: readonly AuditRecord[]): Session[] {
    const mine = records
      .filter((r) => r.actor === actor)
      .sort((a, b) => a.timestamp - b.timestamp || a.seq - b.seq);
    if (mine.length === 0) return [];

    const sessions: Session[] = [];
    let bucket: AuditRecord[] = [mine[0]];
    let idx = 0;

    const flush = (): void => {
      sessions.push(this.buildSession(actor, idx, bucket));
      idx++;
      bucket = [];
    };

    for (let i = 1; i < mine.length; i++) {
      const prev = mine[i - 1];
      const cur = mine[i];
      if (cur.timestamp - prev.timestamp > this._gapMs) {
        flush();
      }
      bucket.push(cur);
    }
    flush();
    return sessions;
  }

  /** Sessions for every actor in the record set. */
  sessions(records: readonly AuditRecord[]): Session[] {
    const actors = [...new Set(records.map((r) => r.actor))];
    const all: Session[] = [];
    for (const a of actors) all.push(...this.sessionsFor(a, records));
    return all.sort((a, b) => a.startedAt - b.startedAt);
  }

  private buildChain(id: string, rs: readonly AuditRecord[]): CorrelationChain {
    return {
      correlationId: id,
      records: this.cap(rs),
      actors: [...new Set(rs.map((r) => r.actor))],
      actions: [...new Set(rs.map((r) => r.action))],
      failures: rs.filter((r) => r.outcome !== 'success').length,
      startedAt: rs[0].timestamp,
      endedAt: rs[rs.length - 1].timestamp,
    };
  }

  private buildSession(actor: string, idx: number, bucket: AuditRecord[]): Session {
    const byAction = new Map<string, number>();
    let failures = 0;
    let maxSev: AuditSeverity = 'debug';
    for (const r of bucket) {
      byAction.set(r.action, (byAction.get(r.action) ?? 0) + 1);
      if (r.outcome !== 'success') failures++;
      if (SEVERITY_ORDER[r.severity] > SEVERITY_ORDER[maxSev]) maxSev = r.severity;
    }
    return {
      actor,
      sessionIndex: idx,
      records: this.cap(bucket),
      startedAt: bucket[0].timestamp,
      endedAt: bucket[bucket.length - 1].timestamp,
      durationMs: bucket[bucket.length - 1].timestamp - bucket[0].timestamp,
      failures,
      maxSeverity: maxSev,
      topActions: [...byAction.entries()]
        .map(([action, count]) => ({ action, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    };
  }

  private cap<T>(arr: readonly T[]): readonly T[] {
    return this._maxRecords > 0 ? arr.slice(0, this._maxRecords) : arr;
  }
}
