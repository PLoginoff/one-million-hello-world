/**
 * SessionRegistry
 *
 * Per-user session tracking with a bounded concurrency policy.
 *
 * Data structures:
 *  - `_byId`:     Map<sessionId, Session> — O(1) lookup/revoke
 *  - `_byUser`:   Map<userId, Set<sessionId>> — per-user enumeration
 *
 * Sessions are kept in Map insertion order per user, so eviction of the
 * least-recently-seen session when `maxPerUser` is exceeded is a linear
 * scan over that user's sessions only (typically ≤ bound, e.g. 10).
 *
 * Expiry is lazy: `touch`/`get` check `expiresAt`; `sweep` removes all
 * expired sessions in one pass for callers that want proactive cleanup.
 *
 * @module Identity/Core
 */

import { randomBytes } from 'crypto';
import { Session, IdentityCoreError, IdentityErrorCode } from './types';

export class SessionRegistry {
  private readonly _byId: Map<string, Session> = new Map();
  private readonly _byUser: Map<string, Set<string>> = new Map();
  private readonly _maxPerUser: number;

  constructor(maxPerUser: number = 0) {
    this._maxPerUser = maxPerUser;
  }

  /**
   * Create a session for `userId`. If the user is at the concurrency cap,
   * the least-recently-seen session is revoked first (returns it via
   * `evicted` on the result tuple).
   */
  create(
    userId: string,
    now: number = Date.now(),
    ttlMs?: number,
    metadata: Record<string, unknown> = {}
  ): { session: Session; evicted?: Session } {
    const session: Session = {
      id: `sess_${randomBytes(18).toString('base64url')}`,
      userId,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: ttlMs !== undefined ? now + ttlMs : undefined,
      metadata: { ...metadata },
    };
    this._byId.set(session.id, session);
    let set = this._byUser.get(userId);
    if (!set) {
      set = new Set();
      this._byUser.set(userId, set);
    }
    set.add(session.id);

    let evicted: Session | undefined;
    if (this._maxPerUser > 0 && set.size > this._maxPerUser) {
      const victim = this._leastRecentlySeen(set);
      if (victim) {
        evicted = victim;
        this.revoke(victim.id);
      }
    }
    return { session, evicted };
  }

  /** Fetch a session by id; returns undefined if missing or expired. */
  get(id: string, now: number = Date.now()): Session | undefined {
    const s = this._byId.get(id);
    if (!s) return undefined;
    if (s.expiresAt !== undefined && now >= s.expiresAt) {
      this.revoke(id);
      return undefined;
    }
    return s;
  }

  /** Like `get` but throws SESSION_NOT_FOUND instead of returning undefined. */
  require(id: string, now: number = Date.now()): Session {
    const s = this.get(id, now);
    if (!s) {
      throw new IdentityCoreError(IdentityErrorCode.SESSION_NOT_FOUND, `session not found: ${id}`);
    }
    return s;
  }

  /** Record activity on a session; refreshes lastSeenAt. */
  touch(id: string, now: number = Date.now()): Session {
    const s = this.require(id, now);
    s.lastSeenAt = now;
    return s;
  }

  /** Revoke a single session. Returns true if it existed. */
  revoke(id: string): boolean {
    const s = this._byId.get(id);
    if (!s) return false;
    this._byId.delete(id);
    const set = this._byUser.get(s.userId);
    if (set) {
      set.delete(id);
      if (set.size === 0) this._byUser.delete(s.userId);
    }
    return true;
  }

  /** Revoke every session owned by `userId`. Returns count revoked. */
  revokeAllForUser(userId: string): number {
    const set = this._byUser.get(userId);
    if (!set) return 0;
    const n = set.size;
    for (const id of set) this._byId.delete(id);
    this._byUser.delete(userId);
    return n;
  }

  /** Live (non-expired) sessions for a user, oldest first. */
  sessionsForUser(userId: string, now: number = Date.now()): Session[] {
    const set = this._byUser.get(userId);
    if (!set) return [];
    const out: Session[] = [];
    for (const id of set) {
      const s = this.get(id, now);
      if (s) out.push(s);
    }
    return out;
  }

  /** Re-point all sessions from one user to another (identity merge). */
  reassign(fromUserId: string, toUserId: string): number {
    const set = this._byUser.get(fromUserId);
    if (!set) return 0;
    let moved = 0;
    for (const id of set) {
      const s = this._byId.get(id);
      if (s) {
        s.userId = toUserId;
        moved++;
      }
    }
    this._byUser.delete(fromUserId);
    let dest = this._byUser.get(toUserId);
    if (!dest) {
      dest = new Set();
      this._byUser.set(toUserId, dest);
    }
    for (const id of set) dest.add(id);
    return moved;
  }

  /** Remove all expired sessions. Returns count removed. */
  sweep(now: number = Date.now()): number {
    let removed = 0;
    const expired: string[] = [];
    for (const [id, s] of this._byId) {
      if (s.expiresAt !== undefined && now >= s.expiresAt) expired.push(id);
    }
    for (const id of expired) {
      if (this.revoke(id)) removed++;
    }
    return removed;
  }

  /** Total live session count (diagnostics). */
  size(): number {
    return this._byId.size;
  }

  private _leastRecentlySeen(set: Set<string>): Session | undefined {
    let victim: Session | undefined;
    for (const id of set) {
      const s = this._byId.get(id);
      if (s && (!victim || s.lastSeenAt < victim.lastSeenAt)) victim = s;
    }
    return victim;
  }
}
