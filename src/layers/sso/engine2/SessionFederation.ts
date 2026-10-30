/**
 * Cross-Domain Session Federation
 *
 * Shares a session across domains that can't share a cookie (different
 * eTLD+1s, e.g. `app-a.com` → `app-b.net`), via a signed one-time
 * federation token exchanged server-to-server or via browser redirect.
 *
 * Flow (OAuth "token exchange" shape):
 *   1. Domain A holds the user's session. User navigates to domain B.
 *   2. B redirects to A's federation endpoint; A mints a short-lived,
 *      single-use `FederationToken` = { subject, sourceDomain,
 *      targetDomain, sessionAttributes, expiry } + MAC.
 *   3. B presents the token to A (back-channel) or validates the MAC
 *      with a shared key; B then establishes its own local session.
 *
 * Token reuse is prevented by a consumed-token set (jti cache). Tokens
 * are bound to (source, target) domain pairs — a token minted for B is
 * rejected at C.
 *
 * @module Sso/Engine2
 */

import { sha256, utf8, hex, timingSafeEqual, IRandomSource, SystemRandomSource } from '../../mfa/engine2/WebAuthn';

/** A session on one domain. */
export interface FederatedSession {
  readonly sessionId: string;
  readonly subject: string;
  readonly domain: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly createdAt: number;
  readonly expiresAt: number;
}

/** Signed hand-off token. */
export interface FederationToken {
  /** Unique token id (jti). */
  readonly jti: string;
  readonly subject: string;
  readonly sourceDomain: string;
  readonly targetDomain: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly expiresAt: number;
}

export interface FederationOptions {
  /** Token TTL — should be short. Default 60s. */
  readonly tokenTtlMs?: number;
  /** Session TTL for locally established sessions. Default 8h. */
  readonly sessionTtlMs?: number;
  /** Allowed (source → target) pairs; empty = allow all. */
  readonly allowedPairs?: readonly (readonly [string, string])[];
}

interface TokenRecord extends FederationToken {
  consumed: boolean;
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

/**
 * Coordinates session sharing across domains. Holds per-domain session
 * stores and the shared signing key used to mint/verify hand-off tokens.
 */
export class SessionFederation {
  private readonly sessions = new Map<string, FederatedSession>(); // sessionId → session
  private readonly tokens = new Map<string, TokenRecord>(); // jti → record
  private readonly secret: Uint8Array;
  private readonly tokenTtl: number;
  private readonly sessionTtl: number;
  private readonly allowed: ReadonlySet<string>;

  constructor(
    private readonly rng: IRandomSource = new SystemRandomSource(),
    private readonly clock: () => number = Date.now,
    options: FederationOptions = {},
    secret?: Uint8Array
  ) {
    this.tokenTtl = options.tokenTtlMs ?? 60_000;
    this.sessionTtl = options.sessionTtlMs ?? 8 * 3600_000;
    this.secret = secret ?? rng.bytes(32);
    this.allowed = new Set((options.allowedPairs ?? []).map(([a, b]) => a + '→' + b));
  }

  /** Establish a local session on a domain (e.g. after primary login). */
  createSession(
    domain: string,
    subject: string,
    attributes: Record<string, string> = {}
  ): FederatedSession {
    const s: FederatedSession = {
      sessionId: hex(this.rng.bytes(16)),
      subject,
      domain,
      attributes,
      createdAt: this.clock(),
      expiresAt: this.clock() + this.sessionTtl,
    };
    this.sessions.set(s.sessionId, s);
    return s;
  }

  session(sessionId: string): FederatedSession | undefined {
    const s = this.sessions.get(sessionId);
    if (!s || s.expiresAt < this.clock()) return undefined;
    return s;
  }

  /** Mint a signed hand-off token from a live session to a target domain. */
  mintToken(sessionId: string, targetDomain: string): string {
    const s = this.session(sessionId);
    if (!s) throw new FederationError('no live session');
    if (this.allowed.size > 0 && !this.allowed.has(s.domain + '→' + targetDomain)) {
      throw new FederationError(`federation ${s.domain} → ${targetDomain} not allowed`);
    }
    const tok: FederationToken = {
      jti: hex(this.rng.bytes(16)),
      subject: s.subject,
      sourceDomain: s.domain,
      targetDomain,
      attributes: s.attributes,
      expiresAt: this.clock() + this.tokenTtl,
    };
    const mac = this.mac(tok);
    this.tokens.set(tok.jti, { ...tok, consumed: false });
    return encodeToken(tok, mac);
  }

  /**
   * Exchange a hand-off token for a local session on the target domain.
   * Validates MAC, expiry, domain binding, and single-use.
   */
  exchange(tokenString: string, targetDomain: string): FederatedSession | null {
    const decoded = decodeToken(tokenString);
    if (!decoded) return null;
    const { token, mac } = decoded;
    if (token.targetDomain !== targetDomain) return null;
    const rec = this.tokens.get(token.jti);
    if (!rec || rec.consumed) return null;
    if (!timingSafeEqual(utf8(recMac(this.secret, token)), utf8(mac))) return null;
    if (token.expiresAt < this.clock()) return null;
    rec.consumed = true; // single use — replay protection
    return this.createSession(targetDomain, token.subject, { ...token.attributes });
  }

  /** Validate a token without consuming it (pre-flight check). */
  inspect(tokenString: string): FederationToken | null {
    const decoded = decodeToken(tokenString);
    if (!decoded) return null;
    if (!timingSafeEqual(utf8(recMac(this.secret, decoded.token)), utf8(decoded.mac))) return null;
    return decoded.token;
  }

  /** Revoke every session for a subject on every domain (SLO hook). */
  revokeForSubject(subject: string): number {
    let n = 0;
    for (const [id, s] of this.sessions) {
      if (s.subject === subject) {
        this.sessions.delete(id);
        n++;
      }
    }
    return n;
  }

  /** Drop expired sessions and consumed/expired tokens. */
  gc(): number {
    const now = this.clock();
    let n = 0;
    for (const [id, s] of this.sessions) {
      if (s.expiresAt < now) {
        this.sessions.delete(id);
        n++;
      }
    }
    for (const [id, t] of this.tokens) {
      if (t.consumed || t.expiresAt < now) {
        this.tokens.delete(id);
        n++;
      }
    }
    return n;
  }

  private mac(t: FederationToken): string {
    return recMac(this.secret, t);
  }
}

export class FederationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FederationError';
  }
}

/* ---------------------------------------------------------------------- */
/* Token wire format: base64url(json) "." hex(mac)                        */
/* ---------------------------------------------------------------------- */

function recMac(secret: Uint8Array, t: FederationToken): string {
  const exp = new Uint8Array(8);
  new DataView(exp.buffer).setFloat64(0, t.expiresAt, false);
  const attrs = utf8(
    Object.keys(t.attributes)
      .sort()
      .map((k) => `${k}=${t.attributes[k]}`)
      .join('&')
  );
  return hex(
    sha256(
      concatBytes(secret, utf8(t.jti), utf8(t.subject), utf8(t.sourceDomain), utf8(t.targetDomain), exp, attrs)
    )
  );
}

function b64urlEncode(b: Uint8Array): string {
  let s = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += chars[(n >> 18) & 63];
    s += chars[(n >> 12) & 63];
    if (i + 1 < b.length) s += chars[(n >> 6) & 63];
    if (i + 2 < b.length) s += chars[n & 63];
  }
  return s;
}

function b64urlDecode(s: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const idx = new Map<string, number>();
  for (let i = 0; i < chars.length; i++) idx.set(chars[i], i);
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const ch of s) {
    const v = idx.get(ch);
    if (v === undefined) return new Uint8Array(0);
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

function encodeToken(t: FederationToken, mac: string): string {
  return b64urlEncode(utf8(JSON.stringify(t))) + '.' + mac;
}

function decodeToken(s: string): { token: FederationToken; mac: string } | null {
  const dot = s.indexOf('.');
  if (dot <= 0) return null;
  const payload = b64urlDecode(s.slice(0, dot));
  if (payload.length === 0) return null;
  try {
    const token = JSON.parse(String.fromCharCode(...payload)) as FederationToken;
    return { token, mac: s.slice(dot + 1) };
  } catch {
    return null;
  }
}
