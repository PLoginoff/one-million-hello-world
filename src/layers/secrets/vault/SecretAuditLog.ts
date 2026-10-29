/**
 * Secrets Layer — Access Audit Log
 *
 * Append-only, ring-bounded log of every secret access. Two hard rules:
 *
 *   1. Secret values are NEVER written to the log — entries carry path,
 *      action, principal and a detail string only. Callers get a compile-time
 *      API where the value can't be passed accidentally.
 *   2. Entries are immutable and sequence-numbered so a report can detect
 *      gaps (a dropped entry shows as a seq hole).
 *
 * Bounded by `capacity` (ring — oldest evicted first, matching compliance
 * systems that retain a sliding window). Query supports filtering by path
 * prefix, action set, principal and time range — implemented as a single
 * linear scan; audit queries are rare and O(capacity) is fine.
 *
 * @module Secrets/Vault
 */

import { AuditAction, AuditEntry, SecretsClock } from './SecretTypes';

export interface AuditQuery {
  readonly pathPrefix?: string;
  readonly actions?: ReadonlyArray<AuditAction>;
  readonly principal?: string;
  readonly since?: number;
  readonly until?: number;
  readonly limit?: number;
  /** Only failures. */
  readonly failuresOnly?: boolean;
}

export class SecretAuditLog {
  private readonly _clock: SecretsClock;
  private readonly _capacity: number;
  private _entries: AuditEntry[] = [];
  private _seq = 0;

  constructor(clock: SecretsClock = Date.now, capacity = 10_000) {
    this._clock = clock;
    this._capacity = capacity;
  }

  get size(): number {
    return this._entries.length;
  }

  /** Append an entry. Returns its sequence number. */
  record(action: AuditAction, path: string, principal: string, success: boolean, detail?: string): number {
    const seq = this._seq++;
    this._entries.push({
      seq,
      at: this._clock(),
      action,
      path,
      principal,
      success,
      ...(detail !== undefined ? { detail } : {}),
    });
    if (this._entries.length > this._capacity) {
      // Ring eviction — drop from the front (oldest seqs).
      this._entries.splice(0, this._entries.length - this._capacity);
    }
    return seq;
  }

  /** Filtered scan. Order is chronological (seq ascending). */
  query(q: AuditQuery = {}): AuditEntry[] {
    const actionSet = q.actions !== undefined ? new Set(q.actions) : undefined;
    const out: AuditEntry[] = [];
    for (const e of this._entries) {
      if (actionSet && !actionSet.has(e.action)) continue;
      if (q.pathPrefix !== undefined && !e.path.startsWith(q.pathPrefix)) continue;
      if (q.principal !== undefined && e.principal !== q.principal) continue;
      if (q.since !== undefined && e.at < q.since) continue;
      if (q.until !== undefined && e.at > q.until) continue;
      if (q.failuresOnly === true && e.success) continue;
      out.push(e);
      if (q.limit !== undefined && out.length >= q.limit) break;
    }
    return out;
  }

  /** Detect dropped entries — seq gaps mean data loss upstream of us. */
  gaps(): number {
    if (this._entries.length < 2) return 0;
    let gaps = 0;
    for (let i = 1; i < this._entries.length; i++) {
      if (this._entries[i].seq !== this._entries[i - 1].seq + 1) gaps++;
    }
    return gaps;
  }

  /** Per-action counts — the shape the statistics/ layer expects. */
  summary(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const e of this._entries) {
      const key = `${e.action}:${e.success ? 'ok' : 'fail'}`;
      out[key] = (out[key] ?? 0) + 1;
    }
    return out;
  }

  clear(): void {
    this._entries = [];
  }
}
