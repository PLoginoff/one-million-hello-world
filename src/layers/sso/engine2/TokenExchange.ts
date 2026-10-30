/**
 * Token Exchange (RFC 8693 shape) — swap one token for another scoped
 * to a different audience or principal (impersonation/delegation).
 *
 *   - `exchange(subjectToken, { audience, scope, actor? })` validates the
 *     incoming token and mints a new one with the requested audience and
 *      MAY carry `act` (actor) for delegation, or `sub` for impersonation.
 *   - Exchange policies gate which (issuer → audience, scope) pairs are
 *     allowed and whether impersonation/delegation is permitted.
 *   - Exchanged tokens form a chain (`act` nesting); depth is bounded.
 *
 * Tokens are MAC'd like the session-federation module but self-contained
 * (no shared secret needed across services — one issuer verifies).
 *
 * @module Sso/Engine2
 */

import { sha256, utf8, hex, timingSafeEqual, IRandomSource, SystemRandomSource } from '../../mfa/engine2/WebAuthn';

export interface TokenClaims {
  readonly iss: string; // issuer
  readonly sub: string; // subject
  readonly aud: string; // audience
  readonly scope: readonly string[];
  readonly exp: number; // expiry (ms)
  readonly jti: string;
  /** Delegation chain — each entry is an actor who exchanged onward. */
  readonly act: readonly string[];
  readonly iat: number;
}

export interface ExchangeRequest {
  /** Token being exchanged (the "subject token"). */
  readonly subjectToken: string;
  /** Desired audience for the new token. */
  readonly audience: string;
  /** Desired scopes — must be ⊆ subject's scopes unless policy widens. */
  readonly scope?: readonly string[];
  /** Acting party (for delegation); omitted for impersonation. */
  readonly actor?: string;
  /** Impersonate this subject instead of keeping the original. */
  readonly impersonate?: string;
}

export interface ExchangePolicy {
  /** Which issuers' tokens we accept for exchange. */
  readonly trustedIssuers: readonly string[];
  /** Audiences we may mint for; empty = any. */
  readonly allowedAudiences: readonly string[];
  /** Can an `act` claim be added (delegation)? */
  readonly allowDelegation: boolean;
  /** Can `sub` be rewritten (impersonation)? */
  readonly allowImpersonation: boolean;
  /** Max delegation depth (act chain length). Default 3. */
  readonly maxActDepth?: number;
  /** New token TTL ms. Default 300s. */
  readonly tokenTtlMs?: number;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export class TokenExchange {
  private readonly secret: Uint8Array;
  private readonly policy: ExchangePolicy;
  private readonly revoked = new Set<string>(); // jti denylist

  constructor(
    policy: ExchangePolicy,
    private readonly rng: IRandomSource = new SystemRandomSource(),
    private readonly clock: () => number = Date.now,
    secret?: Uint8Array
  ) {
    this.policy = policy;
    this.secret = secret ?? rng.bytes(32);
  }

  /** Mint a root token (e.g. from a primary login). */
  mint(iss: string, sub: string, aud: string, scope: readonly string[], ttlMs?: number): string {
    const claims: TokenClaims = {
      iss,
      sub,
      aud,
      scope,
      exp: this.clock() + (ttlMs ?? this.policy.tokenTtlMs ?? 300_000),
      jti: hex(this.rng.bytes(16)),
      act: [],
      iat: this.clock(),
    };
    return encode(claims, this.mac(claims));
  }

  /** Exchange a valid token for a new one scoped to `audience`. */
  exchange(req: ExchangeRequest): { token: string; claims: TokenClaims } | { error: string } {
    const decoded = decode(req.subjectToken);
    if (!decoded) return { error: 'malformed token' };
    const { claims, mac } = decoded;
    if (!timingSafeEqual(utf8(this.mac(claims)), utf8(mac))) return { error: 'bad signature' };
    if (claims.exp < this.clock()) return { error: 'token expired' };
    if (this.revoked.has(claims.jti)) return { error: 'token revoked' };
    if (!this.policy.trustedIssuers.includes(claims.iss)) {
      return { error: `untrusted issuer '${claims.iss}'` };
    }
    if (this.policy.allowedAudiences.length > 0 && !this.policy.allowedAudiences.includes(req.audience)) {
      return { error: `audience '${req.audience}' not allowed` };
    }
    const depth = claims.act.length;
    if (req.actor !== undefined) {
      if (!this.policy.allowDelegation) return { error: 'delegation not permitted' };
      if (depth >= (this.policy.maxActDepth ?? 3)) return { error: 'max delegation depth exceeded' };
    }
    if (req.impersonate !== undefined && !this.policy.allowImpersonation) {
      return { error: 'impersonation not permitted' };
    }
    // Scope narrowing: requested scopes must ⊆ original.
    const wantedScope = req.scope ?? claims.scope;
    if (!wantedScope.every((s) => claims.scope.includes(s))) {
      return { error: 'requested scope exceeds subject token scope' };
    }

    const next: TokenClaims = {
      iss: claims.iss,
      sub: req.impersonate ?? claims.sub,
      aud: req.audience,
      scope: wantedScope,
      exp: this.clock() + (this.policy.tokenTtlMs ?? 300_000),
      jti: hex(this.rng.bytes(16)),
      act: req.actor !== undefined ? [...claims.act, req.actor] : claims.act,
      iat: this.clock(),
    };
    return { token: encode(next, this.mac(next)), claims: next };
  }

  /** Validate a token locally. */
  verify(token: string): TokenClaims | null {
    const d = decode(token);
    if (!d) return null;
    if (!timingSafeEqual(utf8(this.mac(d.claims)), utf8(d.mac))) return null;
    if (d.claims.exp < this.clock()) return null;
    if (this.revoked.has(d.claims.jti)) return null;
    return d.claims;
  }

  revoke(jti: string): void {
    this.revoked.add(jti);
  }

  private mac(c: TokenClaims): string {
    const fields = concatBytes(
      utf8(c.iss), utf8(c.sub), utf8(c.aud), utf8(c.scope.join(',')), utf8(c.act.join(',')),
      utf8(String(c.exp)), utf8(c.jti), utf8(String(c.iat))
    );
    return hex(sha256(concatBytes(this.secret, fields)));
  }
}

/* Wire format: base64url(json).hex-mac */
function encode(c: TokenClaims, mac: string): string {
  const json = utf8(JSON.stringify(c));
  return b64url(json) + '.' + mac;
}
function decode(s: string): { claims: TokenClaims; mac: string } | null {
  const dot = s.lastIndexOf('.');
  if (dot <= 0) return null;
  const raw = unb64url(s.slice(0, dot));
  if (!raw) return null;
  try {
    return { claims: JSON.parse(String.fromCharCode(...raw)) as TokenClaims, mac: s.slice(dot + 1) };
  } catch {
    return null;
  }
}
function b64url(b: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let s = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += chars[(n >> 18) & 63] + chars[(n >> 12) & 63];
    if (i + 1 < b.length) s += chars[(n >> 6) & 63];
    if (i + 2 < b.length) s += chars[n & 63];
  }
  return s;
}
function unb64url(s: string): Uint8Array | null {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const idx = new Map<string, number>();
  for (let i = 0; i < chars.length; i++) idx.set(chars[i], i);
  const out: number[] = [];
  let acc = 0, bits = 0;
  for (const ch of s) {
    const v = idx.get(ch);
    if (v === undefined) return null;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}
