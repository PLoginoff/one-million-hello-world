/**
 * TokenBlacklist — revocation list for JWTs by `jti` or full token hash.
 *
 * Entries carry the token's `exp`; once exp passes, the entry is pruned
 * automatically (a token can't become un-revoked after it expires).
 */

import { createHash } from 'crypto';
import { JwtParser } from './JwtParser';
import { JwtTokenError } from './types';

interface BlacklistEntry {
  /** Hash of the token or the jti value. */
  key: string;
  /** Unix ms when this entry becomes irrelevant. */
  expiresAtMs: number;
  /** Free-form reason. */
  reason?: string;
  revokedAtMs: number;
}

export class TokenBlacklist {
  private entries = new Map<string, BlacklistEntry>();
  private readonly now: () => number;

  constructor(opts: { now?: () => number } = {}) {
    this.now = opts.now ?? (() => Date.now());
  }

  /**
   * Revoke a token. If the token has a `jti`, that is used as the key;
   * otherwise a SHA-256 hash of the full token is used.
   * The entry auto-expires at the token's `exp` (+1s safety).
   */
  revoke(token: string, reason?: string): void {
    const decoded = JwtParser.tryDecode(token);
    const nowMs = this.now();
    let expiresAtMs: number;
    let key: string;
    if (decoded && decoded.payload.jti) {
      key = `jti:${decoded.payload.jti}`;
      expiresAtMs = decoded.payload.exp !== undefined ? (decoded.payload.exp + 1) * 1000 : nowMs + 24 * 60 * 60 * 1000;
    } else {
      key = `hash:${createHash('sha256').update(token).digest('hex')}`;
      expiresAtMs = decoded?.payload.exp !== undefined ? (decoded.payload.exp + 1) * 1000 : nowMs + 24 * 60 * 60 * 1000;
    }
    this.entries.set(key, {
      key,
      expiresAtMs,
      reason,
      revokedAtMs: nowMs,
    });
  }

  /**
   * Revoke by jti directly (useful when the token string is unavailable).
   * `expSeconds` should be the token's exp claim; defaults to now + 24h.
   */
  revokeJti(jti: string, expSeconds?: number, reason?: string): void {
    const nowMs = this.now();
    this.entries.set(`jti:${jti}`, {
      key: `jti:${jti}`,
      expiresAtMs: expSeconds !== undefined ? (expSeconds + 1) * 1000 : nowMs + 24 * 60 * 60 * 1000,
      reason,
      revokedAtMs: nowMs,
    });
  }

  /**
   * Check whether a token is revoked. Returns the entry if revoked, else null.
   */
  check(token: string): BlacklistEntry | null {
    this.prune();
    const decoded = JwtParser.tryDecode(token);
    const keysToCheck: string[] = [];
    if (decoded?.payload.jti) keysToCheck.push(`jti:${decoded.payload.jti}`);
    keysToCheck.push(`hash:${createHash('sha256').update(token).digest('hex')}`);
    for (const k of keysToCheck) {
      const e = this.entries.get(k);
      if (e) return e;
    }
    return null;
  }

  /** Whether a jti is revoked. */
  isJtiRevoked(jti: string): boolean {
    this.prune();
    return this.entries.has(`jti:${jti}`);
  }

  /** Throw JwtTokenError if token is revoked. */
  assertNotRevoked(token: string): void {
    const entry = this.check(token);
    if (entry) {
      throw new JwtTokenError('revoked', 'Token has been revoked', {
        revokedAt: new Date(entry.revokedAtMs).toISOString(),
        reason: entry.reason,
      });
    }
  }

  /** Remove entries whose token exp has passed. Returns removed count. */
  prune(): number {
    const now = this.now();
    let removed = 0;
    for (const [key, entry] of this.entries) {
      if (entry.expiresAtMs <= now) {
        this.entries.delete(key);
        removed++;
      }
    }
    return removed;
  }

  /** Count of active (non-expired) entries. */
  get size(): number {
    this.prune();
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }
}
