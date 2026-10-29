/**
 * SignedUrl — CDN signed URLs for private content.
 *
 * Produces expiring URLs the edge can verify without contacting the
 * signing service:
 *
 *   signature = HMAC-SHA256(secret, path + expires + [ip] + [policy])
 *
 * Two modes:
 *  - Query signing: `?expires=..&sig=..` appended to the URL (with an
 *    optional `ip=` restriction binding the URL to a client address)
 *  - Policy signing: a base64url JSON policy (path prefix, expiry,
 *    optional IP) is embedded and signed — lets one signature cover a
 *    whole directory tree (`/media/*`), matching CloudFront-style
 *    canned vs custom policies
 *
 * The verifier re-derives the signature from the request URL and
 * compares in constant time. Clock injection for tests.
 *
 * @module EdgeCache/Cdn
 */

import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

export interface SignedUrlPolicy {
  /** Path prefix the policy covers, e.g. '/media/'. */
  resource: string;
  /** Epoch ms expiry. */
  expires: number;
  /** Optional client IP (CIDR-less exact match). */
  ip?: string;
}

export interface VerifyResult {
  ok: boolean;
  reason?: 'expired' | 'bad_signature' | 'ip_mismatch' | 'path_outside_policy' | 'malformed';
  policy?: SignedUrlPolicy;
}

export class SignedUrl {
  private readonly _secret: Buffer;

  constructor(secret: string | Buffer) {
    this._secret = typeof secret === 'string' ? Buffer.from(secret, 'utf8') : secret;
  }

  static generateSecret(): string {
    return randomBytes(32).toString('base64url');
  }

  private _mac(input: string): string {
    return createHmac('sha256', this._secret).update(input).digest('base64url');
  }

  /**
   * Sign a single URL (canned policy): `path?expires=E&sig=S[&ip=I]`.
   * Existing query params are preserved.
   */
  sign(url: string, expiresMs: number, ip?: string): string {
    const qIndex = url.indexOf('?');
    const path = qIndex < 0 ? url : url.slice(0, qIndex);
    const existing = qIndex < 0 ? '' : url.slice(qIndex + 1);
    const payload = ip !== undefined ? `${path}|${expiresMs}|${ip}` : `${path}|${expiresMs}`;
    const sig = this._mac(payload);
    const params = new URLSearchParams(existing);
    params.set('expires', String(expiresMs));
    if (ip !== undefined) params.set('ip', ip);
    params.set('sig', sig);
    return `${path}?${params.toString()}`;
  }

  /** Verify a URL signed by `sign`. */
  verify(url: string, now: number = Date.now(), clientIp?: string): VerifyResult {
    const qIndex = url.indexOf('?');
    if (qIndex < 0) return { ok: false, reason: 'malformed' };
    const path = url.slice(0, qIndex);
    const params = new URLSearchParams(url.slice(qIndex + 1));
    const expires = Number(params.get('expires'));
    const sig = params.get('sig');
    const ip = params.get('ip') ?? undefined;
    if (!Number.isFinite(expires) || sig === null) return { ok: false, reason: 'malformed' };
    if (now >= expires) return { ok: false, reason: 'expired' };
    if (ip !== undefined && clientIp !== undefined && ip !== clientIp) {
      return { ok: false, reason: 'ip_mismatch' };
    }
    if (ip !== undefined && clientIp === undefined) {
      return { ok: false, reason: 'ip_mismatch' };
    }
    const payload = ip !== undefined ? `${path}|${expires}|${ip}` : `${path}|${expires}`;
    const expected = this._mac(payload);
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'bad_signature' };
    return { ok: true, policy: { resource: path, expires, ip } };
  }

  /**
   * Sign a policy covering a path prefix (custom policy):
   * `path?policy=<b64(policy)>&sig=<hmac(policy)>`
   */
  signPolicy(policy: SignedUrlPolicy): string {
    const body = Buffer.from(JSON.stringify(policy), 'utf8').toString('base64url');
    const sig = this._mac(body);
    return `policy=${encodeURIComponent(body)}&sig=${sig}`;
  }

  /** Verify a policy signature against a requested path + client IP. */
  verifyPolicy(path: string, query: string, now: number = Date.now(), clientIp?: string): VerifyResult {
    const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
    const policyB64 = params.get('policy');
    const sig = params.get('sig');
    if (!policyB64 || !sig) return { ok: false, reason: 'malformed' };
    const expected = this._mac(policyB64);
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'bad_signature' };
    let policy: SignedUrlPolicy;
    try {
      policy = JSON.parse(Buffer.from(policyB64, 'base64url').toString('utf8')) as SignedUrlPolicy;
    } catch {
      return { ok: false, reason: 'malformed' };
    }
    if (now >= policy.expires) return { ok: false, reason: 'expired', policy };
    if (policy.ip !== undefined && policy.ip !== clientIp) return { ok: false, reason: 'ip_mismatch', policy };
    if (!path.startsWith(policy.resource)) return { ok: false, reason: 'path_outside_policy', policy };
    return { ok: true, policy };
  }
}

