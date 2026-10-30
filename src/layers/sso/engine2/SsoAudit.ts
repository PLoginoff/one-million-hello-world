/**
 * SSO Audit Trail
 *
 * Append-only, tamper-evident event log for authentication activity:
 *
 *   - every event is chained: `hash = sha256(prevHash || eventJson)` —
 *     a Merkle-style integrity chain. Truncating or rewriting history
 *     breaks verification.
 *   - events: login success/failure, logout, token mint/exchange,
 *     identity link/unlink/merge, provisioning, MFA challenge issued/
 *     passed/failed.
 *   - queryable by subject, event type, time range, and correlation id
 *     (one correlation id spans login → token exchange → assertion).
 *
 * Storage is in-memory with an `IEventSink` seam for shipping to a real
 * audit service. Verification is O(n) single pass.
 *
 * @module Sso/Engine2
 */

import { sha256, utf8, hex } from '../../mfa/engine2/WebAuthn';

export type SsoEventType =
  | 'login.success'
  | 'login.failure'
  | 'logout'
  | 'token.minted'
  | 'token.exchanged'
  | 'session.created'
  | 'session.revoked'
  | 'identity.linked'
  | 'identity.unlinked'
  | 'identity.merged'
  | 'account.provisioned'
  | 'mfa.challenged'
  | 'mfa.passed'
  | 'mfa.failed'
  | 'slo.propagated';

export interface SsoEvent {
  readonly seq: number;
  readonly type: SsoEventType;
  readonly subject: string;
  /** Free-form detail (idpId, sessionId, reason, ...). */
  readonly detail: Readonly<Record<string, string>>;
  /** Spans a multi-step flow (login → token exchange → assertion). */
  readonly correlationId?: string;
  readonly at: number;
  /** Hash chaining this event to the log: sha256(prevHash || json). */
  readonly hash: string;
  readonly prevHash: string;
}

export interface IEventSink {
  write(event: SsoEvent): void;
}

export interface AuditQuery {
  readonly subject?: string;
  readonly type?: SsoEventType;
  readonly since?: number;
  readonly until?: number;
  readonly correlationId?: string;
  readonly limit?: number;
}

const GENESIS = 'genesis';

export class SsoAuditTrail {
  private readonly events: SsoEvent[] = [];
  private headHash = GENESIS;
  /** subject → event indices */
  private readonly bySubject = new Map<string, number[]>();
  /** type → event indices */
  private readonly byType = new Map<SsoEventType, number[]>();
  /** correlationId → event indices */
  private readonly byCorrelation = new Map<string, number[]>();

  constructor(
    private readonly clock: () => number = Date.now,
    private readonly sink?: IEventSink
  ) {}

  /** Append an event; returns it with chain hash computed. */
  record(
    type: SsoEventType,
    subject: string,
    detail: Record<string, string> = {},
    correlationId?: string
  ): SsoEvent {
    const body = {
      seq: this.events.length,
      type,
      subject,
      detail,
      correlationId,
      at: this.clock(),
    };
    const hash = hex(sha256(utf8(this.headHash + '|' + JSON.stringify(body))));
    const event: SsoEvent = { ...body, hash, prevHash: this.headHash };
    this.headHash = hash;

    const idx = this.events.length;
    this.events.push(event);
    push(this.bySubject, subject, idx);
    push(this.byType, type, idx);
    if (correlationId !== undefined) push(this.byCorrelation, correlationId, idx);
    this.sink?.write(event);
    return event;
  }

  /** Query with index acceleration for subject/type/correlation. */
  query(q: AuditQuery): readonly SsoEvent[] {
    // Pick the narrowest index.
    let candidates: number[] | undefined;
    const pick = <K>(m: Map<K, number[]>, k: K | undefined) => {
      if (k === undefined) return;
      const idxs = m.get(k) ?? [];
      if (candidates === undefined || idxs.length < candidates.length) candidates = idxs;
    };
    pick(this.bySubject, q.subject);
    pick(this.byType, q.type);
    pick(this.byCorrelation, q.correlationId);
    const pool = candidates ?? this.events.map((_, i) => i);

    const out: SsoEvent[] = [];
    for (const i of pool) {
      const e = this.events[i];
      if (q.subject !== undefined && e.subject !== q.subject) continue;
      if (q.type !== undefined && e.type !== q.type) continue;
      if (q.correlationId !== undefined && e.correlationId !== q.correlationId) continue;
      if (q.since !== undefined && e.at < q.since) continue;
      if (q.until !== undefined && e.at > q.until) continue;
      out.push(e);
      if (q.limit !== undefined && out.length >= q.limit) break;
    }
    return out;
  }

  /**
   * Verify the whole chain — returns the index of the first broken
   * event, or -1 when intact. O(n).
   */
  verify(): number {
    let prev = GENESIS;
    for (const e of this.events) {
      const body = {
        seq: e.seq,
        type: e.type,
        subject: e.subject,
        detail: e.detail,
        correlationId: e.correlationId,
        at: e.at,
      };
      const expected = hex(sha256(utf8(prev + '|' + JSON.stringify(body))));
      if (e.prevHash !== prev || e.hash !== expected) return e.seq;
      prev = e.hash;
    }
    return -1;
  }

  get length(): number {
    return this.events.length;
  }

  get head(): string {
    return this.headHash;
  }
}

function push<K>(m: Map<K, number[]>, k: K, i: number): void {
  const arr = m.get(k);
  if (arr) arr.push(i);
  else m.set(k, [i]);
}
