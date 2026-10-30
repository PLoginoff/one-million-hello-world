/**
 * DPoPVerifier — RFC 9449 Demonstrating Proof of Possession.
 *
 * A DPoP proof is a JWT the client signs with its ephemeral key:
 *
 *   header:  { typ: "dpop+jwt", alg: <asym alg>, jwk: <public JWK> }
 *   payload: { jti, htm, htu, iat, ath? }
 *
 * Verification (signature check itself is delegated to an injected
 * verifier — this module owns the *proof semantics*):
 *
 *   1. Structure: typ must be 'dpop+jwt'; alg must be asymmetric (no
 *      'none', no HS* — a symmetric alg would prove nothing).
 *   2. Freshness: |now - iat| ≤ maxAgeSec and iat not in the future
 *      beyond `clockSkewSec`.
 *   3. Target binding: `htm`/`htu` must match the actual request
 *      method+URI (htu compared without query — per RFC 9449 §4.2 the
 *      query is excluded).
 *   4. Replay: `jti` is remembered per thumbprint for `maxAgeSec`; a
 *      repeated jti inside the window is a replay.
 *   5. Access-token binding: when the token's cnf.jkt is present, the
 *      proof's embedded JWK must thumbprint to it; `ath` (when the
 *      access token is known) must equal SHA-256(accessToken) b64url.
 *
 * Replay cache: Map<jkt+jti, expiresAt> with lazy eviction — O(1) per
 * insert/lookup.
 *
 * @module JwtValidationLayer/Engine2
 */

import { createHash } from 'crypto';
import { base64urlDecodeToString, base64urlEncode } from '../jwt/base64url';
import { isRecord, JsonWebKeyObject } from '../jwt/types';
import { JwtClock2, SystemJwtClock2, TokenClaims2 } from './types';
import { jwkThumbprint } from './TokenBinding';

/** Signature verification is delegated — tests stub it, production wires
 *  the layer's JwtVerifier. Receives the compact JWT and the embedded
 *  JWK; returns true iff the signature is valid. */
export type DpopSignatureVerifier = (compactJwt: string, jwk: JsonWebKeyObject) => boolean;

export interface DPoPVerifyOptions {
  /** Max acceptable proof age in seconds. Default 60. */
  maxAgeSec?: number;
  /** Allowed future-clock skew for iat in seconds. Default 30. */
  clockSkewSec?: number;
  /** Signature verifier. Default: accept-all stub (TEST ONLY — inject
   *  a real verifier in production). */
  verifySignature?: DpopSignatureVerifier;
  clock?: JwtClock2;
}

export type DPoPOutcome =
  | { readonly ok: true; readonly jkt: string; readonly jti: string }
  | { readonly ok: false; readonly reason: string };

interface DpopPayload {
  jti?: string;
  htm?: string;
  htu?: string;
  iat?: number;
  ath?: string;
}

const SYMMETRIC_PREFIX = /^HS/;

export class DPoPVerifier {
  private readonly _maxAgeSec: number;
  private readonly _skewSec: number;
  private readonly _verifySig: DpopSignatureVerifier;
  private readonly _clock: JwtClock2;
  /** Replay cache: `${jkt}:${jti}` → expiry epoch ms. */
  private readonly _seen = new Map<string, number>();

  constructor(opts: DPoPVerifyOptions = {}) {
    this._maxAgeSec = opts.maxAgeSec ?? 60;
    this._skewSec = opts.clockSkewSec ?? 30;
    this._verifySig = opts.verifySignature ?? (() => true);
    this._clock = opts.clock ?? new SystemJwtClock2();
  }

  /**
   * Verify a DPoP proof JWT.
   *
   * @param proofJwt    the compact JWS from the DPoP header
   * @param httpMethod  actual request method
   * @param httpUri     actual request URI (query stripped by caller or here)
   * @param accessToken the presented access token claims (for cnf.jkt /
   *                    ath binding — pass claims, not the raw token, plus
   *                    the raw token for ath comparison)
   */
  verify(
    proofJwt: string,
    httpMethod: string,
    httpUri: string,
    accessToken?: { claims: TokenClaims2; raw?: string }
  ): DPoPOutcome {
    const parts = proofJwt.split('.');
    if (parts.length !== 3) {
      return { ok: false, reason: 'not a compact JWS (3 parts expected)' };
    }

    /* ---- header ---- */
    let header: Record<string, unknown>;
    try {
      header = JSON.parse(base64urlDecodeToString(parts[0]));
    } catch {
      return { ok: false, reason: 'undecodable JOSE header' };
    }
    if (!isRecord(header)) return { ok: false, reason: 'header is not an object' };
    if (header['typ'] !== 'dpop+jwt') {
      return { ok: false, reason: `typ must be 'dpop+jwt', got ${JSON.stringify(header['typ'])}` };
    }
    const alg = header['alg'];
    if (typeof alg !== 'string' || alg === 'none' || SYMMETRIC_PREFIX.test(alg)) {
      return { ok: false, reason: `alg '${String(alg)}' is not asymmetric` };
    }
    const jwk = header['jwk'];
    if (!jwk || typeof jwk !== 'object' || !('kty' in jwk)) {
      return { ok: false, reason: 'header.jwk missing or malformed' };
    }
    // The embedded JWK must not carry private material.
    const embedded = jwk as JsonWebKeyObject;
    if (embedded.d || embedded.k) {
      return { ok: false, reason: 'embedded JWK contains private key material' };
    }

    /* ---- signature ---- */
    if (!this._verifySig(proofJwt, embedded)) {
      return { ok: false, reason: 'signature verification failed' };
    }

    /* ---- payload ---- */
    let payload: DpopPayload;
    try {
      payload = JSON.parse(base64urlDecodeToString(parts[1])) as DpopPayload;
    } catch {
      return { ok: false, reason: 'undecodable payload' };
    }
    const nowSec = Math.floor(this._clock.now() / 1000);

    if (typeof payload.iat !== 'number') {
      return { ok: false, reason: 'missing iat' };
    }
    if (payload.iat > nowSec + this._skewSec) {
      return { ok: false, reason: 'iat is in the future' };
    }
    if (nowSec - payload.iat > this._maxAgeSec) {
      return { ok: false, reason: `proof older than ${this._maxAgeSec}s` };
    }
    if (typeof payload.jti !== 'string' || payload.jti.length === 0) {
      return { ok: false, reason: 'missing jti' };
    }
    if (payload.htm?.toUpperCase() !== httpMethod.toUpperCase()) {
      return { ok: false, reason: `htm '${String(payload.htm)}' != '${httpMethod}'` };
    }
    if (typeof payload.htu !== 'string' || this._normalizeUri(payload.htu) !== this._normalizeUri(httpUri)) {
      return { ok: false, reason: `htu '${String(payload.htu)}' != '${httpUri}'` };
    }

    const jkt = jwkThumbprint(embedded);
    if (jkt === null) {
      return { ok: false, reason: 'cannot thumbprint embedded JWK' };
    }

    /* ---- access-token binding ---- */
    if (accessToken) {
      const expectedJkt = accessToken.claims.cnf?.jkt;
      if (expectedJkt !== undefined && expectedJkt !== jkt) {
        return { ok: false, reason: 'proof JWK does not match token cnf.jkt' };
      }
      if (accessToken.raw !== undefined && payload.ath !== undefined) {
        const actual = base64urlEncode(createHash('sha256').update(accessToken.raw).digest());
        if (actual !== payload.ath) {
          return { ok: false, reason: 'ath does not match access token hash' };
        }
      }
    }

    /* ---- replay ---- */
    const replayKey = `${jkt}:${payload.jti}`;
    const seenAt = this._seen.get(replayKey);
    if (seenAt !== undefined && this._clock.now() < seenAt) {
      return { ok: false, reason: `jti '${payload.jti}' already used (replay)` };
    }
    this._seen.set(replayKey, this._clock.now() + this._maxAgeSec * 1000);
    this._evict();

    return { ok: true, jkt, jti: payload.jti };
  }

  /** How many jti entries are live in the replay cache. */
  get replayCacheSize(): number {
    this._evict();
    return this._seen.size;
  }

  /* ---------------------------------------------------------------- */

  /** Strip query + fragment — RFC 9449 compares htu without them. */
  private _normalizeUri(uri: string): string {
    const q = uri.indexOf('?');
    const f = uri.indexOf('#');
    let end = uri.length;
    if (q >= 0) end = Math.min(end, q);
    if (f >= 0) end = Math.min(end, f);
    return uri.slice(0, end);
  }

  /** Drop expired replay entries (amortized — every 64 inserts). */
  private _evict(): void {
    if (this._seen.size < 64) return;
    const now = this._clock.now();
    for (const [k, exp] of this._seen) {
      if (now >= exp) this._seen.delete(k);
    }
  }
}
