/**
 * IdentityAuditLog — append-only security event trail.
 *
 * Records authentication, lifecycle, token, and administrative events
 * with a hash-chained integrity seal: each entry embeds
 * `sha256(prevHash || canonical(entry))`, so a tampered or deleted
 * historical record breaks verification of every subsequent entry —
 * the same technique used by audit systems like QLDB journals.
 *
 * Query surface: by user, by event type, by time range, with a bounded
 * ring capacity (oldest entries evicted past `capacity`, but the chain
 * head hash is retained so evicted history still anchors verification).
 *
 * @module Identity/Core
 */

import { createHash } from 'crypto';
import { canonicalize } from '../core/canonical';

/** Security event kinds recorded in the log. */
export enum AuditEventKind {
  REGISTER = 'register',
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILURE = 'login_failure',
  LOGOUT = 'logout',
  PASSWORD_CHANGE = 'password_change',
  PASSWORD_RESET = 'password_reset',
  EMAIL_VERIFIED = 'email_verified',
  PHONE_VERIFIED = 'phone_verified',
  ACCOUNT_LOCKED = 'account_locked',
  ACCOUNT_SUSPENDED = 'account_suspended',
  ACCOUNT_ACTIVATED = 'account_activated',
  ACCOUNT_DELETED = 'account_deleted',
  IDENTITY_MERGED = 'identity_merged',
  TOKEN_ISSUED = 'token_issued',
  TOKEN_CONSUMED = 'token_consumed',
}

export interface AuditEntry {
  seq: number;
  kind: AuditEventKind;
  /** Subject user id (or actor for admin events). */
  userId?: string;
  /** Acting party (admin uid, 'system', 'user:self'). */
  actor: string;
  at: number;
  details?: Record<string, unknown>;
  /** sha256(prevHash + canonical(entry-without-hash)). */
  hash: string;
}

export interface AuditQuery {
  userId?: string;
  kind?: AuditEventKind;
  since?: number;
  until?: number;
  limit?: number;
}

const GENESIS = 'GENESIS';

function hashEntry(prevHash: string, e: Omit<AuditEntry, 'hash'>): string {
  return createHash('sha256').update(prevHash + canonicalize(e)).digest('hex');
}

export class IdentityAuditLog {
  private readonly _entries: AuditEntry[] = [];
  private readonly _capacity: number;
  /** Hash of the last evicted entry — verification anchor. */
  private _anchorHash: string = GENESIS;
  private _dropped = 0;

  constructor(capacity = 50_000) {
    this._capacity = capacity;
  }

  /** Append an event. Returns the sealed entry. */
  record(kind: AuditEventKind, opts: { userId?: string; actor?: string; at?: number; details?: Record<string, unknown> } = {}): AuditEntry {
    const prev = this._entries.length > 0 ? this._entries[this._entries.length - 1].hash : this._anchorHash;
    const partial = {
      seq: this._dropped + this._entries.length,
      kind,
      userId: opts.userId,
      actor: opts.actor ?? 'system',
      at: opts.at ?? Date.now(),
      details: opts.details,
    };
    const entry: AuditEntry = { ...partial, hash: hashEntry(prev, partial) };
    this._entries.push(entry);
    if (this._entries.length > this._capacity) {
      const evicted = this._entries.shift()!;
      this._anchorHash = evicted.hash;
      this._dropped++;
    }
    return entry;
  }

  /** Query entries (newest-first), filtered. */
  query(q: AuditQuery = {}): AuditEntry[] {
    const out: AuditEntry[] = [];
    for (let i = this._entries.length - 1; i >= 0; i--) {
      const e = this._entries[i];
      if (q.userId !== undefined && e.userId !== q.userId) continue;
      if (q.kind !== undefined && e.kind !== q.kind) continue;
      if (q.since !== undefined && e.at < q.since) continue;
      if (q.until !== undefined && e.at > q.until) continue;
      out.push(e);
      if (q.limit !== undefined && out.length >= q.limit) break;
    }
    return out;
  }

  /**
   * Verify chain integrity over the retained window. Returns the first
   * bad sequence number, or -1 if the window verifies. Tampering with
   * any entry's payload changes its hash, breaking the next link.
   */
  verify(): number {
    let prev = this._anchorHash;
    for (const e of this._entries) {
      const { hash, ...rest } = e;
      const expected = hashEntry(prev, rest);
      if (expected !== hash) return e.seq;
      prev = hash;
    }
    return -1;
  }

  size(): number {
    return this._entries.length;
  }

  /** Count of entries evicted past capacity (they still anchor the chain). */
  droppedCount(): number {
    return this._dropped;
  }
}
