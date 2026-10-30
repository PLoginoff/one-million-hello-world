/**
 * Access Journal — decision audit trail for the authz engine2.
 *
 * Every obligation-aware check funnels through the journal, which
 * appends an immutable `AccessEvent` and exposes queries for security
 * review ("show every denied access to `vault:*` this week") and for
 * obligation bookkeeping ("which decisions still owe a `notify`
 * execution?"). The journal is the audit-side counterpart to the
 * ObligationEngine's enforcement side.
 *
 * Queries are index-assisted: a per-(subject, permission-prefix) index
 * narrows scans, then filters apply. Records are seq-stamped so the
 * journal is a stable, replayable log.
 *
 * @module AuthorizationLayer/Engine2
 */

import { AuthzClock, DueObligation, SystemAuthzClock } from './types';

/** One authorization decision, journaled for audit. */
export interface AccessEvent {
  readonly seq: number;
  readonly at: number;
  readonly subjectId: string;
  readonly permission: string;
  readonly allowed: boolean;
  readonly effect: 'allow' | 'deny';
  /** Why: the obligation ids that fired, and any MFA gate. */
  readonly obligationIds: readonly string[];
  readonly mfaRequired: boolean;
  /** Correlation id linking to the broader request trace. */
  readonly correlationId?: string;
  readonly environment?: Readonly<Record<string, unknown>>;
}

export interface AccessQuery {
  readonly subjectId?: string;
  readonly permissionPattern?: string; // `admin:*` or exact
  readonly allowed?: boolean;
  readonly fromMs?: number;
  readonly toMs?: number;
  readonly limit?: number;
}

export interface AccessStats {
  readonly total: number;
  readonly allowed: number;
  readonly denied: number;
  readonly mfaBlocked: number;
  /** Top denied permission patterns — attack surface. */
  readonly topDenied: readonly { permission: string; count: number }[];
}

function patternMatches(permission: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('*')) return permission.startsWith(pattern.slice(0, -1));
  return permission === pattern;
}

function prefixOf(permission: string): string {
  const i = permission.indexOf(':');
  return i === -1 ? permission : permission.slice(0, i);
}

export class AccessJournal {
  private readonly _clock: AuthzClock;
  private _seq = 0;
  private readonly _events: AccessEvent[] = [];
  /** permission-prefix → event indices, narrowing scans. */
  private readonly _byPrefix = new Map<string, number[]>();
  /** subjectId → event indices. */
  private readonly _bySubject = new Map<string, number[]>();

  constructor(clock?: AuthzClock) {
    this._clock = clock ?? new SystemAuthzClock();
  }

  /** Append a decision — the single write path. */
  record(
    subjectId: string,
    permission: string,
    allowed: boolean,
    obligations: readonly DueObligation[],
    mfaRequired: boolean,
    environment?: Record<string, unknown>,
    correlationId?: string
  ): AccessEvent {
    const ev: AccessEvent = {
      seq: ++this._seq,
      at: this._clock.now(),
      subjectId,
      permission,
      allowed,
      effect: allowed ? 'allow' : 'deny',
      obligationIds: obligations.map((o) => o.id),
      mfaRequired,
      correlationId,
      environment,
    };
    const idx = this._events.length;
    this._events.push(ev);

    const prefix = prefixOf(permission);
    const byP = this._byPrefix.get(prefix) ?? [];
    byP.push(idx);
    this._byPrefix.set(prefix, byP);

    const byS = this._bySubject.get(subjectId) ?? [];
    byS.push(idx);
    this._bySubject.set(subjectId, byS);

    return ev;
  }

  /**
   * Query the journal. Uses the prefix index when the pattern narrows
   * to one prefix (`admin:*`), and the subject index when given —
   * falls back to a full scan otherwise.
   */
  query(q: AccessQuery): readonly AccessEvent[] {
    // Candidate index: subject narrows hardest when present.
    let candidates: readonly AccessEvent[];
    if (q.subjectId !== undefined) {
      const idxs = this._bySubject.get(q.subjectId) ?? [];
      candidates = idxs.map((i) => this._events[i]);
    } else if (q.permissionPattern !== undefined && q.permissionPattern.endsWith(':*')) {
      const prefix = q.permissionPattern.slice(0, -2); // strip `:*` → `admin`
      const idxs = this._byPrefix.get(prefix) ?? [];
      candidates = idxs.map((i) => this._events[i]);
    } else {
      candidates = this._events;
    }

    const out = candidates.filter((e) => {
      if (q.permissionPattern !== undefined && !patternMatches(e.permission, q.permissionPattern)) {
        return false;
      }
      if (q.allowed !== undefined && e.allowed !== q.allowed) return false;
      if (q.fromMs !== undefined && e.at < q.fromMs) return false;
      if (q.toMs !== undefined && e.at > q.toMs) return false;
      return true;
    });
    return q.limit !== undefined ? out.slice(0, q.limit) : out;
  }

  /** Aggregate stats — denial histogram is the security-review signal. */
  stats(fromMs?: number, toMs?: number): AccessStats {
    const events = this._events.filter(
      (e) => (fromMs === undefined || e.at >= fromMs) && (toMs === undefined || e.at <= toMs)
    );
    const deniedCount = new Map<string, number>();
    let allowed = 0;
    let denied = 0;
    let mfaBlocked = 0;
    for (const e of events) {
      if (e.allowed) allowed++;
      else {
        denied++;
        deniedCount.set(e.permission, (deniedCount.get(e.permission) ?? 0) + 1);
      }
      if (e.mfaRequired) mfaBlocked++;
    }
    return {
      total: events.length,
      allowed,
      denied,
      mfaBlocked,
      topDenied: [...deniedCount.entries()]
        .map(([permission, count]) => ({ permission, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    };
  }

  get size(): number {
    return this._events.length;
  }
}
