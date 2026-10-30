/**
 * SignedUrl — HMAC-signed CDN URLs with expiry, IP and method binding.
 *
 * Signed payload: `path + sorted-query + expires + ip? + method?`
 * signed with HMAC-SHA256, base64url-encoded. The verifier recomputes
 * over the request URL and compares in constant time.
 *
 * Two sign modes:
 *   - `sign`    — appends `?expires=&sig=` to the URL (canned policy)
 *   - `signPolicy` — embeds a base64url JSON policy (path prefix +
 *                 expiry + optional IP) so one signature covers a
 *                 whole subtree, CloudFront-style
 *
 * @module CdnIntegration/Engines
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { IClock, SignedUrlOptions, SignedUrlVerify, SystemClock } from './types';

const SIG_PARAM = 'sig';
const EXPIRES_PARAM = 'expires';
const POLICY_PARAM = 'policy';

interface PolicyPayload {
  /** Path prefix the policy covers (`/media/`). */
  resource: string;
  expires: number;
  ip?: string;
}

export class SignedUrl {
  private readonly _secret: Buffer;
  private readonly _clock: IClock;
  private readonly _keyId: string | undefined;

  constructor(secret: string | Buffer, clock: IClock = new SystemClock(), keyId?: string) {
    this._secret = typeof secret === 'string' ? Buffer.from(secret, 'utf8') : secret;
    this._clock = clock;
    this._keyId = keyId;
  }

  /**
   * Sign a URL: `url?expires=E&sig=S[&ip=I][&method=M]`.
   * Existing query params are preserved and included in the signature.
   */
  sign(url: string, options: SignedUrlOptions): string {
    const u = new URL(url);
    u.searchParams.set(EXPIRES_PARAM, String(options.expires));
    if (options.ip !== undefined) u.searchParams.set('ip', options.ip);
    if (options.method !== undefined) u.searchParams.set('method', options.method);
    if (this._keyId !== undefined) u.searchParams.set('kid', this._keyId);
    // Sign over path + query WITHOUT the sig param (it's being computed).
    u.searchParams.delete(SIG_PARAM);
    const payload = this._payload(u);
    const sig = this._mac(payload);
    u.searchParams.set(SIG_PARAM, sig);
    return u.toString();
  }

  /**
   * Verify a signed URL. The client IP/method must match the bound
   * values when the URL carries them.
   */
  verify(url: string, clientIp?: string, method = 'GET'): SignedUrlVerify {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return { ok: false, reason: 'malformed' };
    }
    const sig = u.searchParams.get(SIG_PARAM);
    const expires = u.searchParams.get(EXPIRES_PARAM);
    if (sig === null || expires === null) return { ok: false, reason: 'malformed' };

    const exp = Number(expires);
    if (!Number.isFinite(exp)) return { ok: false, reason: 'malformed' };
    if (this._clock.now() > exp) return { ok: false, reason: 'expired' };

    const boundIp = u.searchParams.get('ip');
    if (boundIp !== null && boundIp !== clientIp) {
      return { ok: false, reason: 'ip_mismatch' };
    }
    const boundMethod = u.searchParams.get('method');
    if (boundMethod !== null && boundMethod.toUpperCase() !== method.toUpperCase()) {
      return { ok: false, reason: 'method_mismatch' };
    }

    u.searchParams.delete(SIG_PARAM);
    const expected = this._mac(this._payload(u));
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return { ok: false, reason: 'bad_signature' };
    }
    return { ok: true };
  }

  /**
   * Sign a policy covering a path prefix: `url?policy=<b64>&sig=<S>`.
   * One signature authorizes any URL under `resourcePrefix`.
   */
  signPolicy(url: string, resourcePrefix: string, expires: number, ip?: string): string {
    const policy: PolicyPayload = { resource: resourcePrefix, expires, ...(ip ? { ip } : {}) };
    const b64 = Buffer.from(JSON.stringify(policy), 'utf8').toString('base64url');
    const u = new URL(url);
    u.searchParams.set(POLICY_PARAM, b64);
    u.searchParams.delete(SIG_PARAM);
    // Policy signatures cover the policy blob itself.
    u.searchParams.set(SIG_PARAM, this._mac(b64));
    return u.toString();
  }

  /** Verify a policy-signed request URL. */
  verifyPolicy(url: string, clientIp?: string): SignedUrlVerify {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return { ok: false, reason: 'malformed' };
    }
    const b64 = u.searchParams.get(POLICY_PARAM);
    const sig = u.searchParams.get(SIG_PARAM);
    if (b64 === null || sig === null) return { ok: false, reason: 'malformed' };

    let policy: PolicyPayload;
    try {
      policy = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8')) as PolicyPayload;
    } catch {
      return { ok: false, reason: 'malformed' };
    }

    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(this._mac(b64)))) {
      return { ok: false, reason: 'bad_signature' };
    }
    if (this._clock.now() > policy.expires) return { ok: false, reason: 'expired' };
    if (policy.ip !== undefined && policy.ip !== clientIp) {
      return { ok: false, reason: 'ip_mismatch' };
    }
    if (!u.pathname.startsWith(policy.resource)) {
      return { ok: false, reason: 'malformed' };
    }
    return { ok: true };
  }

  private _payload(u: URL): string {
    // Canonical form: path + sorted query params (excluding sig).
    const pairs: Array<[string, string]> = [];
    for (const [k, v] of u.searchParams.entries()) {
      if (k === SIG_PARAM) continue;
      pairs.push([k, v]);
    }
    pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const qs = pairs.map(([k, v]) => `${k}=${v}`).join('&');
    return `${u.pathname}${qs ? `?${qs}` : ''}`;
  }

  private _mac(input: string): string {
    return createHmac('sha256', this._secret).update(input).digest('base64url');
  }
}
