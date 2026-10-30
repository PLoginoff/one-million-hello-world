/**
 * RequestSigner — HMAC-SHA256 canonical-request signing with a
 * timestamp window and nonce replay defense.
 *
 * This is the AWS SigV4 *shape* distilled to its portable core —
 * the canonical string covers method/path/sorted-query/signed-headers
 * /payload-hash/timestamp. That exact construction is what makes the
 * signature mean "this caller, with this key, sent exactly these
 * bytes, at this time" rather than just "someone with the key sent
 * something".
 *
 * Canonical form (newline-joined):
 *   METHOD\n
 *   path\n
 *   k1=v1&k2=v2          (params sorted by encoded key, dupes kept
 *                         ordered — ambiguous ordering is a known
 *                         signature-bypass vector)
 *   signed-header-names  (semicolon-joined, lower-case, sorted)
 *   h1:v1\nh2:v2\n       (each signed header canonicalized:
 *                         lower-case name, trimmed, WS-collapsed value)
 *   payloadHash
 *   timestamp
 *   nonce                (empty when absent)
 *
 * Then: `signature = hex(HMAC-SHA256(secret, canonical))`.
 *
 * Verification checks in order — each failure has a distinct
 * `reason` so callers can log precisely (a stale timestamp isn't a
 * forged signature and shouldn't alert as one):
 *   1. required headers present;
 *   2. timestamp within ±windowSec of the server clock;
 *   3. nonce unseen in the window (replay);
 *   4. HMAC comparison in *constant time* — `crypto.timingSafeEqual`
 *      or a manual OR-accumulate; `===` on hex is a timing oracle.
 *
 * Node `crypto` is used for the HMAC — per project rules that's the
 * one external allowed, and hand-rolled HMAC is never correct to
 * write anyway.
 *
 * @module SecurityLayer/Engine
 */

import { createHmac, timingSafeEqual } from 'crypto';
import {
  CanonicalRequest,
  RequestSignerOptions,
  SecurityClock,
  SignatureResult,
  SignatureVerificationError,
  SigningKey,
  SystemSecurityClock,
  VerificationResult,
} from './types';

/**
 * Canonicalize one query component: decode first (so `%20` and a
 * literal space normalize identically — otherwise two encodings of
 * the same param produce different signatures, a malleability hole),
 * then re-encode with the RFC 3986 unreserved set (encodeURIComponent
 * leaves `!'()*` literal; SigV4-style canonical forms pct-encode them).
 */
function canonicalParam(s: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(s);
  } catch {
    decoded = s; // malformed pct-encoding — sign it verbatim
  }
  return encodeURIComponent(decoded).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

/** Sort a query string into canonical `k=v&k=v` order. */
export function canonicalQueryString(query: string): string {
  if (!query) {
    return '';
  }
  const pairs: [string, string][] = [];
  for (const seg of query.split('&')) {
    if (seg.length === 0) {
      continue;
    }
    const eq = seg.indexOf('=');
    if (eq < 0) {
      pairs.push([seg, '']);
    } else {
      pairs.push([seg.slice(0, eq), seg.slice(eq + 1)]);
    }
  }
  // Sort by encoded key, then encoded value — ambiguous dup ordering
  // is a signature-malleability hole.
  pairs.sort((a, b) => {
    const ka = canonicalParam(a[0]);
    const kb = canonicalParam(b[0]);
    if (ka !== kb) {
      return ka < kb ? -1 : 1;
    }
    const va = canonicalParam(a[1]);
    const vb = canonicalParam(b[1]);
    return va < vb ? -1 : va > vb ? 1 : 0;
  });
  return pairs.map(([k, v]) => `${canonicalParam(k)}=${canonicalParam(v)}`).join('&');
}

/** Collapse OWS runs inside a header value (HTTP folding semantics). */
function canonicalHeaderValue(v: string): string {
  return v.trim().replace(/\s+/g, ' ');
}

export class RequestSigner {
  private readonly _windowSec: number;
  private readonly _requiredHeaders: readonly string[];
  private readonly _nonceTtlSec: number;
  private readonly _clock: SecurityClock;
  /** Seen nonces: nonce → expiry time. LRU-free — bounded by TTL sweep. */
  private _nonces: Map<string, number>;

  constructor(options: RequestSignerOptions = {}) {
    this._windowSec = options.timestampWindowSec ?? 300;
    this._requiredHeaders = options.requiredHeaders ?? [];
    this._nonceTtlSec = options.nonceTtlSec ?? 300;
    this._clock = options.clock ?? new SystemSecurityClock();
    this._nonces = new Map();
  }

  /* ---------------------------------------------------------------- */
  /* Signing                                                           */
  /* ---------------------------------------------------------------- */

  /** Build the canonical string for a request (deterministic). */
  canonicalize(req: CanonicalRequest): { canonical: string; signedHeaders: string[] } {
    // Lower-case every header name once into a lookup map — the
    // canonical form only cares about lower-cased names, and a
    // request carrying both `X` and `x` is already malformed (the
    // later one wins, matching most servers).
    const byLower = new Map<string, string>();
    for (const [k, v] of Object.entries(req.headers)) {
      byLower.set(k.toLowerCase(), v);
    }
    const names = [...byLower.keys()].sort();
    const signedHeaders = names.join(';');
    const headerLines = names
      .map((n) => `${n}:${canonicalHeaderValue(byLower.get(n) ?? '')}`)
      .join('\n');

    const canonical = [
      req.method.toUpperCase(),
      req.path,
      canonicalQueryString(req.query ?? ''),
      signedHeaders,
      headerLines,
      req.payloadHash,
      String(req.timestamp),
      req.nonce ?? '',
    ].join('\n');

    return { canonical, signedHeaders: names };
  }

  /** Sign a request. Returns the hex signature + canonical string. */
  sign(req: CanonicalRequest, key: SigningKey): SignatureResult {
    const { canonical, signedHeaders } = this.canonicalize(req);
    const signature = createHmac('sha256', key.secret).update(canonical).digest('hex');
    return { signature, canonical, signedHeaders };
  }

  /* ---------------------------------------------------------------- */
  /* Verification                                                      */
  /* ---------------------------------------------------------------- */

  /**
   * Verify a presented signature against the canonical request.
   * Nonce and timestamp checks happen *before* the HMAC — there's no
   * point paying for the crypto when the request is already dead.
   */
  verify(
    req: CanonicalRequest,
    key: SigningKey,
    presentedSignature: string
  ): VerificationResult {
    const nowSec = Math.floor(this._clock.now() / 1000);
    const skew = Math.abs(nowSec - req.timestamp);

    // 1. Required headers present (case-insensitive).
    const lower = new Set(Object.keys(req.headers).map((h) => h.toLowerCase()));
    for (const h of this._requiredHeaders) {
      if (!lower.has(h.toLowerCase())) {
        return { ok: false, reason: 'missing-header' };
      }
    }

    // 2. Timestamp window.
    if (req.timestamp > nowSec + this._windowSec) {
      return { ok: false, reason: 'future-timestamp', skewSec: skew };
    }
    if (nowSec - req.timestamp > this._windowSec) {
      return { ok: false, reason: 'stale-timestamp', skewSec: skew };
    }

    // 3. Replay: nonce must not have been seen inside its TTL.
    if (this._nonceTtlSec > 0 && req.nonce) {
      this._sweepNonces(nowSec);
      if (this._nonces.has(req.nonce)) {
        return { ok: false, reason: 'replay', skewSec: skew };
      }
    }

    // 4. Constant-time signature comparison.
    const { signature } = this.sign(req, key);
    if (!safeEqualHex(signature, presentedSignature)) {
      return { ok: false, reason: 'bad-signature', skewSec: skew };
    }

    // Record the nonce only on success — a failed verification must
    // not consume the nonce (an attacker could pre-burn a victim's
    // nonce by presenting it with a bad signature).
    if (this._nonceTtlSec > 0 && req.nonce) {
      this._nonces.set(req.nonce, nowSec + this._nonceTtlSec);
    }

    return { ok: true, skewSec: skew };
  }

  /**
   * Strict-verify variant: throws `SignatureVerificationError` on any
   * failure — for code paths that want exception flow.
   */
  verifyOrThrow(req: CanonicalRequest, key: SigningKey, presentedSignature: string): void {
    const r = this.verify(req, key, presentedSignature);
    if (!r.ok) {
      throw new SignatureVerificationError(r.reason ?? 'unknown');
    }
  }

  /** Drop expired nonces — O(n) in the seen-set, amortized by TTL. */
  private _sweepNonces(nowSec: number): void {
    for (const [nonce, expiry] of this._nonces) {
      if (expiry <= nowSec) {
        this._nonces.delete(nonce);
      }
    }
  }
}

/**
 * Constant-time hex comparison. `timingSafeEqual` needs equal-length
 * buffers; a length mismatch is itself an answer but not a timing
 * secret worth hiding — different-length sigs are already invalid.
 */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}
