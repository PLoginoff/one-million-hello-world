/**
 * SessionPersistence — sticky sessions via cookie or identity hash.
 *
 * Two strategies, composable (cookie first, hash as fallback):
 *
 *  1. Cookie affinity: the balancer issues an opaque cookie value that
 *     encodes backend id + HMAC signature (tamper-proof, no server-side
 *     state required to *read*). Format:
 *
 *       <base64url(backendId)>.<unixSeconds>.<base64url(hmac-sha256)>
 *
 *     Cookies expire after `ttlMs`; stale cookies fall through to re-bind.
 *
 *  2. Hash affinity: a stable caller identity (user id, source IP,
 *     Authorization subject) is mapped to a backend by rendezvous
 *     (highest-random-weight) hashing — the same caller lands on the same
 *     backend whenever the *set* of candidates is the same, and remaps
 *     are minimal when a backend leaves (only its keys move).
 *
 * The session table additionally remembers explicit bindings so repeated
 * lookups are O(1) and survive candidate-list reordering.
 *
 * @module LoadBalancerLayer/Engine2
 */

import { createHmac } from 'crypto';
import { Backend2, LbClock2, SystemLbClock2 } from './types';

export interface SessionPersistenceOptions {
  /** HMAC key for signing affinity cookies. */
  secret: string;
  /** Cookie lifetime in ms. Default 3_600_000 (1h). */
  ttlMs?: number;
  clock?: LbClock2;
}

/** Result of resolving a sticky route. */
export interface StickyResolution {
  readonly backendId: string;
  /** Which mechanism produced the binding. */
  readonly via: 'cookie' | 'memory' | 'hash';
}

function b64urlEncode(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64url');
}

function b64urlDecode(s: string): string {
  return Buffer.from(s, 'base64url').toString('utf8');
}

export class SessionPersistence {
  private readonly _secret: string;
  private readonly _ttlMs: number;
  private readonly _clock: LbClock2;
  /** sessionKey → { backendId, expiresAtMs } */
  private readonly _bindings = new Map<string, { backendId: string; expiresAtMs: number }>();

  constructor(opts: SessionPersistenceOptions) {
    if (opts.secret.length < 8) {
      throw new RangeError('secret too short — need >= 8 characters');
    }
    this._secret = opts.secret;
    this._ttlMs = Math.max(1, opts.ttlMs ?? 3_600_000);
    this._clock = opts.clock ?? new SystemLbClock2();
  }

  /* ------------------------- cookie affinity ---------------------- */

  /**
   * Mint an affinity cookie for a backend. Self-verifying: the signature
   * covers backendId + issuance time, so forging requires the key.
   */
  issueCookie(backendId: string): string {
    const issuedSec = Math.floor(this._clock.now() / 1000);
    const idB64 = b64urlEncode(backendId);
    const sig = this._sign(`${idB64}.${issuedSec}`);
    return `${idB64}.${issuedSec}.${sig}`;
  }

  /**
   * Verify and decode an affinity cookie. Returns the backend id, or
   * null when the signature is bad or the cookie has expired.
   */
  readCookie(cookie: string): string | null {
    const parts = cookie.split('.');
    if (parts.length !== 3) return null;
    const [idB64, issuedStr, sig] = parts;
    const issuedSec = Number(issuedStr);
    if (!Number.isInteger(issuedSec) || issuedSec < 0) return null;
    // Constant-time-ish: compare hex digest strings of equal length.
    const expected = this._sign(`${idB64}.${issuedStr}`);
    if (sig.length !== expected.length || sig !== expected) return null;
    const ageMs = this._clock.now() - issuedSec * 1000;
    if (ageMs > this._ttlMs || ageMs < 0) return null;
    return b64urlDecode(idB64);
  }

  /* ------------------------- memory bindings ---------------------- */

  /** Remember sessionKey → backendId for `ttlMs`. */
  bind(sessionKey: string, backendId: string): void {
    this._bindings.set(sessionKey, {
      backendId,
      expiresAtMs: this._clock.now() + this._ttlMs,
    });
  }

  /** Look up a remembered binding. Expired bindings are dropped. */
  lookup(sessionKey: string): string | null {
    const b = this._bindings.get(sessionKey);
    if (!b) return null;
    if (this._clock.now() >= b.expiresAtMs) {
      this._bindings.delete(sessionKey);
      return null;
    }
    return b.backendId;
  }

  /** Remove all bindings pointing at a backend (e.g. on drain). */
  unbindBackend(backendId: string): number {
    let n = 0;
    for (const [k, v] of this._bindings) {
      if (v.backendId === backendId) {
        this._bindings.delete(k);
        n++;
      }
    }
    return n;
  }

  /** Purge expired bindings. Returns count removed. */
  sweep(): number {
    const now = this._clock.now();
    let n = 0;
    for (const [k, v] of this._bindings) {
      if (now >= v.expiresAtMs) {
        this._bindings.delete(k);
        n++;
      }
    }
    return n;
  }

  get bindingCount(): number {
    this.sweep();
    return this._bindings.size;
  }

  /* ------------------------- hash affinity ------------------------ */

  /**
   * Rendezvous (HRW) hashing: pick the candidate maximizing
   * H(identity · backendId). Deterministic, no state, minimal remap —
   * removing a backend only displaces the identities it owned.
   *
   * Complexity: O(C · H) where C = candidates, H = hash cost; fine for
   * the small candidate sets of a single pool (typically < 50).
   */
  hashPick(identity: string, candidates: readonly Backend2[]): Backend2 | null {
    if (candidates.length === 0) return null;
    let best: Backend2 | null = null;
    let bestScore = -1;
    for (const b of candidates) {
      const score = this._rendezvousScore(identity, b.id);
      // Deterministic tiebreak on id keeps results stable across runs.
      if (score > bestScore || (score === bestScore && best !== null && b.id < best.id)) {
        best = b;
        bestScore = score;
      }
    }
    return best;
  }

  /**
   * Full sticky resolution pipeline: cookie → memory → hash → bind.
   * `identity` is required for the hash fallback; cookie/memory work
   * without it.
   */
  resolve(
    opts: { cookie?: string; sessionKey?: string; identity?: string },
    candidates: readonly Backend2[]
  ): StickyResolution | null {
    const ids = new Set(candidates.map((c) => c.id));

    if (opts.cookie) {
      const id = this.readCookie(opts.cookie);
      if (id !== null && ids.has(id)) return { backendId: id, via: 'cookie' };
    }
    if (opts.sessionKey) {
      const id = this.lookup(opts.sessionKey);
      if (id !== null && ids.has(id)) return { backendId: id, via: 'memory' };
    }
    if (opts.identity !== undefined) {
      const picked = this.hashPick(opts.identity, candidates);
      if (picked) {
        const key = opts.sessionKey ?? opts.identity;
        this.bind(key, picked.id);
        return { backendId: picked.id, via: 'hash' };
      }
    }
    return null;
  }

  /* ---------------------------------------------------------------- */

  private _sign(data: string): string {
    return createHmac('sha256', this._secret).update(data).digest('base64url');
  }

  private _rendezvousScore(identity: string, backendId: string): number {
    const digest = createHmac('sha256', this._secret)
      .update(`${identity}${backendId}`)
      .digest();
    // Use the first 8 bytes as a big-endian score; uniform over the key
    // space, so each backend's expected share is equal.
    return Number(digest.readBigUInt64BE(0));
  }
}
