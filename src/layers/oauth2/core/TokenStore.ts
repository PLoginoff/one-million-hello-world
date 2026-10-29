/**
 * TokenStore — in-memory store for authorization codes, access tokens,
 * refresh tokens and device grants. Supports introspection + revocation.
 */

import { createHash, randomBytes } from 'crypto';
import {
  AccessToken,
  AuthorizationCode,
  DeviceGrant,
  IntrospectionResponse,
  OAuth2Error,
  RefreshToken,
  scopeToString,
} from './types';

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class TokenStore {
  private codes = new Map<string, AuthorizationCode>();
  private accessTokens = new Map<string, AccessToken>();
  private refreshTokens = new Map<string, RefreshToken>();
  private deviceGrants = new Map<string, DeviceGrant>();
  private revokedJti = new Set<string>();
  private readonly now: () => number;
  private readonly issuer: string;

  constructor(opts: { now?: () => number; issuer?: string } = {}) {
    this.now = opts.now ?? (() => Date.now());
    this.issuer = opts.issuer ?? 'https://auth.local';
  }

  /* ----------------------- authorization codes -------------------- */

  storeCode(code: AuthorizationCode): void {
    this.codes.set(hash(code.code), code);
  }

  /** Consume a code exactly once. Throws invalid_grant on reuse/expiry. */
  consumeCode(code: string): AuthorizationCode {
    const c = this.codes.get(hash(code));
    if (!c) {
      throw new OAuth2Error('invalid_grant', 'Unknown authorization code');
    }
    if (c.used) {
      // RFC 6749 §4.1.2 — replayed code MUST revoke derived tokens
      this.revokeByClient(c.clientId);
      throw new OAuth2Error('invalid_grant', 'Authorization code already used — tokens revoked');
    }
    if (c.expiresAtMs <= this.now()) {
      throw new OAuth2Error('invalid_grant', 'Authorization code expired');
    }
    c.used = true;
    return c;
  }

  /* ------------------------- access tokens ------------------------ */

  mintAccessToken(opts: {
    clientId: string;
    subject?: string;
    scope: string[];
    ttlSeconds: number;
  }): AccessToken {
    const nowMs = this.now();
    const t: AccessToken = {
      token: `at-${randomBytes(32).toString('hex')}`,
      clientId: opts.clientId,
      subject: opts.subject,
      scope: opts.scope.slice(),
      issuedAtMs: nowMs,
      expiresAtMs: nowMs + opts.ttlSeconds * 1000,
      tokenType: 'Bearer',
      jti: `jti-${randomBytes(8).toString('hex')}`,
    };
    this.accessTokens.set(hash(t.token), t);
    return t;
  }

  /** Look up an access token. Throws if expired/unknown/revoked. */
  requireAccessToken(token: string): AccessToken {
    const t = this.accessTokens.get(hash(token));
    if (!t) throw new OAuth2Error('invalid_grant', 'Unknown access token');
    if (this.revokedJti.has(t.jti)) throw new OAuth2Error('invalid_grant', 'Token revoked');
    if (t.expiresAtMs <= this.now()) throw new OAuth2Error('invalid_grant', 'Token expired');
    return t;
  }

  /* ------------------------- refresh tokens ----------------------- */

  mintRefreshToken(opts: {
    clientId: string;
    subject: string;
    scope: string[];
    ttlSeconds: number;
    familyId?: string;
  }): RefreshToken {
    const nowMs = this.now();
    const rt: RefreshToken = {
      token: `rt-${randomBytes(32).toString('hex')}`,
      clientId: opts.clientId,
      subject: opts.subject,
      scope: opts.scope.slice(),
      expiresAtMs: nowMs + opts.ttlSeconds * 1000,
      familyId: opts.familyId ?? `fam-${randomBytes(8).toString('hex')}`,
      used: false,
    };
    this.refreshTokens.set(hash(rt.token), rt);
    return rt;
  }

  /** Consume a refresh token once. */
  consumeRefreshToken(token: string): RefreshToken {
    const rt = this.refreshTokens.get(hash(token));
    if (!rt) throw new OAuth2Error('invalid_grant', 'Unknown refresh token');
    if (rt.used) {
      // reuse → revoke entire family
      this.revokeFamily(rt.familyId);
      throw new OAuth2Error('invalid_grant', 'Refresh token reuse detected — family revoked');
    }
    if (rt.expiresAtMs <= this.now()) throw new OAuth2Error('invalid_grant', 'Refresh token expired');
    rt.used = true;
    return rt;
  }

  /* -------------------------- device grants ----------------------- */

  storeDeviceGrant(g: DeviceGrant): void {
    this.deviceGrants.set(hash(g.deviceCode), g);
  }

  getDeviceGrant(deviceCode: string): DeviceGrant | null {
    const g = this.deviceGrants.get(hash(deviceCode));
    if (!g) return null;
    if (g.expiresAtMs <= this.now() && g.status === 'pending') {
      g.status = 'expired';
    }
    return g;
  }

  findDeviceGrantByUserCode(userCode: string): DeviceGrant | null {
    for (const g of this.deviceGrants.values()) {
      if (g.userCode === userCode) {
        if (g.expiresAtMs <= this.now() && g.status === 'pending') g.status = 'expired';
        return g;
      }
    }
    return null;
  }

  /* ------------------------- introspection ------------------------ */

  introspect(token: string): IntrospectionResponse {
    const at = this.accessTokens.get(hash(token));
    if (at) {
      const active = at.expiresAtMs > this.now() && !this.revokedJti.has(at.jti);
      if (!active) return { active: false };
      return {
        active: true,
        scope: scopeToString(at.scope),
        client_id: at.clientId,
        username: at.subject,
        token_type: 'Bearer',
        exp: Math.floor(at.expiresAtMs / 1000),
        iat: Math.floor(at.issuedAtMs / 1000),
        sub: at.subject,
        iss: this.issuer,
        jti: at.jti,
      };
    }
    const rt = this.refreshTokens.get(hash(token));
    if (rt) {
      const active = !rt.used && rt.expiresAtMs > this.now();
      if (!active) return { active: false };
      return {
        active: true,
        scope: scopeToString(rt.scope),
        client_id: rt.clientId,
        username: rt.subject,
        sub: rt.subject,
        exp: Math.floor(rt.expiresAtMs / 1000),
        iss: this.issuer,
      };
    }
    return { active: false };
  }

  /* -------------------------- revocation -------------------------- */

  /** Revoke an access or refresh token (RFC 7009). Returns true if found. */
  revoke(token: string): boolean {
    const at = this.accessTokens.get(hash(token));
    if (at) {
      this.revokedJti.add(at.jti);
      this.accessTokens.delete(hash(token));
      return true;
    }
    const rt = this.refreshTokens.get(hash(token));
    if (rt) {
      this.refreshTokens.delete(hash(token));
      return true;
    }
    return false;
  }

  /** Revoke every token for a client (e.g. on code replay). */
  revokeByClient(clientId: string): number {
    let n = 0;
    for (const [h, t] of this.accessTokens) {
      if (t.clientId === clientId) {
        this.revokedJti.add(t.jti);
        this.accessTokens.delete(h);
        n++;
      }
    }
    for (const [h, rt] of this.refreshTokens) {
      if (rt.clientId === clientId) {
        this.refreshTokens.delete(h);
        n++;
      }
    }
    return n;
  }

  /** Revoke all refresh tokens in a family. */
  revokeFamily(familyId: string): number {
    let n = 0;
    for (const [h, rt] of this.refreshTokens) {
      if (rt.familyId === familyId) {
        this.refreshTokens.delete(h);
        n++;
      }
    }
    return n;
  }

  /* ---------------------------- stats ------------------------------ */

  stats(): {
    codes: number;
    accessTokens: number;
    refreshTokens: number;
    deviceGrants: number;
    revokedJti: number;
  } {
    this.prune();
    return {
      codes: this.codes.size,
      accessTokens: this.accessTokens.size,
      refreshTokens: this.refreshTokens.size,
      deviceGrants: this.deviceGrants.size,
      revokedJti: this.revokedJti.size,
    };
  }

  /** Drop expired entries. Returns number removed. */
  prune(): number {
    const now = this.now();
    let n = 0;
    for (const [h, c] of this.codes) {
      if (c.expiresAtMs <= now) {
        this.codes.delete(h);
        n++;
      }
    }
    for (const [h, t] of this.accessTokens) {
      if (t.expiresAtMs <= now) {
        this.accessTokens.delete(h);
        n++;
      }
    }
    for (const [h, rt] of this.refreshTokens) {
      if (rt.expiresAtMs <= now) {
        this.refreshTokens.delete(h);
        n++;
      }
    }
    for (const [h, g] of this.deviceGrants) {
      if (g.expiresAtMs <= now) {
        this.deviceGrants.delete(h);
        n++;
      }
    }
    return n;
  }
}
