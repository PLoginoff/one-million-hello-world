/**
 * CsrfProtection — synchronizer-token CSRF defense with
 * double-submit-cookie verification.
 *
 * The attack: a malicious page causes the victim's browser to send a
 * state-changing request to our app; the browser attaches the victim's
 * cookies automatically. Cookies alone therefore can't prove intent.
 * The defense requires *two* proofs that must agree:
 *
 *   1. a secret the site plants in an unreadable-to-attackers channel
 *      (a cookie the attacker's page can't read — SameSite helps but
 *      isn't a substitute), and
 *   2. the same secret echoed in a channel only same-origin JS can
 *      write (a custom header or a form field).
 *
 * That's the double-submit pattern: `csrfCookie == csrfHeader`. On its
 * own it's weak to cookie-planting subdomains, so we go one step
 * further — the synchronizer-token variant: the token embeds a
 * session-binding field derived from the victim's session id, so a
 * planted cookie fails verification even though it echoes.
 *
 * Wire format: `tokenId.issuedAt.sessionTag.signature` where
 *
 *   sessionTag = HMAC(sessionId)[:8]       — deterministic per session
 *   signature  = HMAC(tokenId | issuedAt | sessionTag)[:22]
 *
 * Verification is deterministic:
 *   - signature check proves the token was minted by us (forgery
 *     filter — the attacker doesn't have the secret);
 *   - `sessionTag == HMAC(requestSession)[:8]` proves the token was
 *     minted for *this* session (a token stolen/minted for another
 *     session is WRONG_SESSION, not ambiguously FORGED);
 *   - freshness window rejects replayed old tokens;
 *   - constant-time equality guards the double-submit comparison.
 *
 * This module is transport-agnostic — cookies/headers arrive as plain
 * strings; the caller does the `Set-Cookie`/`X-CSRF-Token` plumbing.
 *
 * Complexity: all ops O(1); no storage (stateless tokens).
 *
 * @module SecurityLayer/Engine
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { SecurityClock, SystemSecurityClock } from './types';

export interface CsrfOptions {
  /** HMAC secret — server-side only, never leaves the process. */
  readonly secret: string;
  /** Max token age before it's rejected. Default 2h. */
  readonly tokenTtlMs?: number;
  readonly clock?: SecurityClock;
}

export const enum CsrfVerdict {
  VALID = 'valid',
  /** Cookie/header missing or unparsable. */
  MISSING = 'missing',
  /** The two presented tokens don't agree. */
  MISMATCH = 'mismatch',
  /** Signature check failed — forged or wrong-secret token. */
  FORGED = 'forged',
  /** Token structurally valid but minted for a different session. */
  WRONG_SESSION = 'wrong-session',
  /** Signature ok but issued beyond ttlMs ago. */
  STALE = 'stale',
}

export interface CsrfTokenPair {
  /** Value to plant in the CSRF cookie. */
  readonly cookieValue: string;
  /** Value to hand to the page (meta tag / JS global) for the header. */
  readonly headerValue: string;
  /** Opaque token id embedded in both values. */
  readonly tokenId: string;
  readonly issuedAt: number;
}

export class CsrfProtection {
  private readonly _secret: string;
  private readonly _ttlMs: number;
  private readonly _clock: SecurityClock;

  constructor(opts: CsrfOptions) {
    if (!opts.secret || opts.secret.length < 8) {
      throw new Error('CsrfProtection: secret must be ≥ 8 chars');
    }
    this._secret = opts.secret;
    this._ttlMs = opts.tokenTtlMs ?? 2 * 60 * 60 * 1000;
    this._clock = opts.clock ?? new SystemSecurityClock();
  }

  /**
   * Issue a session-bound token pair. Header and cookie carry the same
   * value — the equality check is part of the defense (a different
   * header/cookie pair means someone planted the cookie).
   */
  issue(sessionId: string): CsrfTokenPair {
    const tokenId = randomBytes(8).toString('base64url');
    const issuedAt = this._clock.now();
    const tag = this._sessionTag(sessionId);
    const sig = this._sign(tokenId, issuedAt, tag);
    const value = `${tokenId}.${issuedAt}.${tag}.${sig}`;
    return { cookieValue: value, headerValue: value, tokenId, issuedAt };
  }

  /**
   * Verify a request. `sessionId` binds the token to the session —
   * pass the *validated* session id, not raw cookie bytes. Mutating
   * methods only; safe methods should skip this entirely.
   */
  verify(
    sessionId: string,
    cookieValue: string | undefined,
    headerValue: string | undefined
  ): CsrfVerdict {
    if (!cookieValue || !headerValue) {
      return CsrfVerdict.MISSING;
    }
    // Double-submit: the two presented copies must be identical — a
    // mismatch means the cookie was planted (attacker can write a
    // cookie under a sibling domain but can't read ours, so can't
    // echo the right header).
    if (!constEq(cookieValue, headerValue)) {
      return CsrfVerdict.MISMATCH;
    }
    const parts = cookieValue.split('.');
    if (parts.length !== 4) {
      return CsrfVerdict.MISSING;
    }
    const [tokenId, issuedAtStr, tag, sig] = parts;
    const issuedAt = Number.parseInt(issuedAtStr, 10);
    if (!Number.isFinite(issuedAt)) {
      return CsrfVerdict.MISSING;
    }
    // Forgery filter: the signature proves the token came from us —
    // sessionTag is *inside* it, so a structurally-valid token with a
    // foreign tag is verifiably WRONG_SESSION (not just "bad sig").
    if (!constEq(sig, this._sign(tokenId, issuedAt, tag))) {
      return CsrfVerdict.FORGED;
    }
    if (!constEq(tag, this._sessionTag(sessionId))) {
      return CsrfVerdict.WRONG_SESSION;
    }
    if (this._clock.now() - issuedAt > this._ttlMs) {
      return CsrfVerdict.STALE;
    }
    return CsrfVerdict.VALID;
  }

  /** Session-binding tag: deterministic, 8 base64url chars. */
  private _sessionTag(sessionId: string): string {
    return createHmac('sha256', this._secret)
      .update(`sess:${sessionId}`)
      .digest('base64url')
      .slice(0, 8);
  }

  /** Integrity signature over the token's other fields (22 chars). */
  private _sign(tokenId: string, issuedAt: number, sessionTag: string): string {
    return createHmac('sha256', this._secret)
      .update(`${tokenId}|${issuedAt}|${sessionTag}`)
      .digest('base64url')
      .slice(0, 22);
  }
}

/** Constant-time string equality (lengths may differ — pad both). */
function constEq(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) {
    // Compare bb against itself to keep timing flat-ish.
    timingSafeEqual(bb, bb);
    return false;
  }
  return timingSafeEqual(ba, bb);
}
