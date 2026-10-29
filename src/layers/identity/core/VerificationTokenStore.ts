/**
 * VerificationTokenStore
 *
 * Issues and consumes single-use, TTL-bound verification tokens for
 * email verification, phone verification, password reset, and account
 * recovery.
 *
 * Storage is a Map keyed by the SHA-256 hash of the token value — the
 * raw token is never stored, so a store dump does not leak usable
 * tokens (same discipline as password storage).
 *
 * Issuing a token for (userId, purpose, destination) invalidates all
 * prior unconsumed tokens for that same triple — only the newest
 * token is redeemable, matching real-world "click the latest email"
 * semantics.
 *
 * Consumption is atomic: `consume` marks the token used before the
 * caller performs its side effect; a token can never be redeemed twice.
 *
 * @module Identity/Core
 */

import { createHash, randomBytes } from 'crypto';
import {
  VerificationToken,
  TokenPurpose,
  IdentityCoreError,
  IdentityErrorCode,
} from './types';

const TOKEN_BYTES = 32;

interface TokenRecord {
  tokenHash: string;
  userId: string;
  purpose: TokenPurpose;
  destination: string;
  expiresAt: number;
  consumed: boolean;
}

export class VerificationTokenStore {
  private readonly _records: Map<string, TokenRecord> = new Map();
  /** (userId|purpose|destination) -> tokenHash of the live token. */
  private readonly _live: Map<string, string> = new Map();

  private static _hash(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  private static _key(userId: string, purpose: TokenPurpose, destination: string): string {
    return `${userId}|${purpose}|${destination}`;
  }

  /**
   * Issue a new token. Any existing live token for the same
   * (user, purpose, destination) triple is marked consumed.
   *
   * @returns the opaque token value to deliver out-of-band
   */
  issue(
    userId: string,
    purpose: TokenPurpose,
    destination: string = '',
    ttlMs: number,
    now: number = Date.now()
  ): VerificationToken {
    const raw = randomBytes(TOKEN_BYTES).toString('base64url');
    const tokenHash = VerificationTokenStore._hash(raw);
    const key = VerificationTokenStore._key(userId, purpose, destination);

    const prev = this._live.get(key);
    if (prev !== undefined) {
      const prevRec = this._records.get(prev);
      if (prevRec) prevRec.consumed = true;
    }

    const rec: TokenRecord = {
      tokenHash,
      userId,
      purpose,
      destination,
      expiresAt: now + ttlMs,
      consumed: false,
    };
    this._records.set(tokenHash, rec);
    this._live.set(key, tokenHash);

    return {
      token: raw,
      userId,
      purpose,
      destination,
      expiresAt: rec.expiresAt,
      consumed: false,
    };
  }

  /**
   * Look up a token and validate it for `purpose` WITHOUT consuming it.
   * Throws TOKEN_INVALID / TOKEN_EXPIRED / TOKEN_CONSUMED /
   * TOKEN_PURPOSE_MISMATCH as appropriate.
   */
  inspect(token: string, purpose: TokenPurpose, now: number = Date.now()): VerificationToken {
    const rec = this._records.get(VerificationTokenStore._hash(token));
    if (!rec) {
      throw new IdentityCoreError(IdentityErrorCode.TOKEN_INVALID, 'unknown token');
    }
    if (rec.consumed) {
      throw new IdentityCoreError(IdentityErrorCode.TOKEN_CONSUMED, 'token already used');
    }
    if (rec.purpose !== purpose) {
      throw new IdentityCoreError(
        IdentityErrorCode.TOKEN_PURPOSE_MISMATCH,
        `token purpose mismatch: expected ${purpose}, got ${rec.purpose}`
      );
    }
    if (now >= rec.expiresAt) {
      throw new IdentityCoreError(IdentityErrorCode.TOKEN_EXPIRED, 'token expired');
    }
    return {
      token,
      userId: rec.userId,
      purpose: rec.purpose,
      destination: rec.destination,
      expiresAt: rec.expiresAt,
      consumed: rec.consumed,
    };
  }

  /**
   * Validate AND consume a token atomically. Returns the resolved record.
   * The record is marked consumed before returning, so redemption is
   * single-use even under retry.
   */
  consume(token: string, purpose: TokenPurpose, now: number = Date.now()): VerificationToken {
    const validated = this.inspect(token, purpose, now);
    const rec = this._records.get(VerificationTokenStore._hash(token));
    if (rec) rec.consumed = true;
    return validated;
  }

  /**
   * Drop expired/consumed records (housekeeping). Returns count removed.
   * O(n) over live records.
   */
  sweep(now: number = Date.now()): number {
    let removed = 0;
    for (const [h, rec] of this._records) {
      if (rec.consumed || now >= rec.expiresAt) {
        this._records.delete(h);
        const key = VerificationTokenStore._key(rec.userId, rec.purpose, rec.destination);
        if (this._live.get(key) === h) this._live.delete(key);
        removed++;
      }
    }
    return removed;
  }

  /** Count of records currently held (diagnostics). */
  size(): number {
    return this._records.size;
  }
}
