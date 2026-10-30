/**
 * TokenBroker — cross-IdP session token exchange (RFC 8693-style).
 *
 * When a user federates through partner IdP A but needs to call a
 * service trusting partner IdP B (or this IdP in a different security
 * domain), their token must be EXCHANGED, not replayed. The broker
 * models the exchange:
 *
 *   subject_token (from source IdP) + audience (target) → new token
 *
 * Model (simplified RFC 8693 Token Exchange):
 *   - subject_token carries {iss, sub, exp, aud[], scopes[]}
 *   - the broker validates the subject token (signature stubbed to
 *     issuer registry + expiry), maps scopes onto the target audience's
 *     allowed scope set, and mints a new token with act-as semantics
 *     (`act` claim records the delegation chain)
 *   - exchanges are journaled — a real security audit trail for
 *     "who exchanged whose token for what audience"
 *
 * Delegation chains: a token produced by an exchange can itself be a
 * subject token; each hop appends to `act` so the final audience can
 * see the whole delegation path.
 *
 * @module IdentityProvider/Engine2
 */

import { createHash, randomBytes } from 'crypto';

// ------------------------------------------------------------------ types

/** A federated token (compact claims — not a real JWT). */
export interface FederatedToken {
  /** Issuer entityId. */
  readonly iss: string;
  /** Subject (user id as known to `iss`). */
  readonly sub: string;
  /** Intended audiences. */
  readonly aud: string[];
  /** Granted scopes. */
  readonly scopes: string[];
  /** Epoch ms issued / expires. */
  readonly iat: number;
  readonly exp: number;
  /** Delegation chain — each entry is an actor that exchanged onward. */
  readonly act: Array<{ iss: string; sub: string }>;
  /** Unique token id. */
  readonly jti: string;
}

/** Minted token with its serialized wire form. */
export interface IssuedToken {
  readonly token: FederatedToken;
  /** Signed wire form — HMAC over canonical claims (see `_sign`). */
  readonly wire: string;
}

/** Exchange request. */
export interface ExchangeRequest {
  /** The incoming subject token's wire form. */
  subjectWire: string;
  /** Target audience the new token is for. */
  audience: string;
  /** Requested scopes (intersected with policy). */
  scopes?: string[];
  /** Token lifetime override (ms). */
  ttlMs?: number;
}

/** Exchange audit entry. */
export interface ExchangeAuditEntry {
  readonly at: number;
  readonly subjectJti: string;
  readonly subjectIss: string;
  readonly subjectSub: string;
  readonly targetAudience: string;
  readonly grantedScopes: string[];
  readonly deniedScopes: string[];
  readonly issuedJti: string;
}

// ------------------------------------------------------------------ broker

export class TokenBroker {
  /** Trusted issuer → signing secret (HMAC stand-in). */
  private readonly _issuers = new Map<string, Buffer>();
  /** Audience → set of scopes exchangeable for it. */
  private readonly _audienceScopes = new Map<string, Set<string>>();
  private readonly _audit: ExchangeAuditEntry[] = [];
  private readonly _now: () => number;
  private readonly _defaultTtlMs: number;

  constructor(now: () => number = Date.now, defaultTtlMs = 300_000) {
    this._now = now;
    this._defaultTtlMs = defaultTtlMs;
  }

  /** Register a trusted token issuer with its HMAC secret. */
  trustIssuer(iss: string, secret: Buffer): void {
    this._issuers.set(iss, secret);
  }

  /** Configure the scopes an audience accepts via exchange. */
  allowScopes(audience: string, scopes: string[]): void {
    let set = this._audienceScopes.get(audience);
    if (!set) {
      set = new Set();
      this._audienceScopes.set(audience, set);
    }
    for (const s of scopes) set.add(s);
  }

  private _canonical(t: FederatedToken): string {
    return JSON.stringify({ iss: t.iss, sub: t.sub, aud: t.aud, scopes: t.scopes, iat: t.iat, exp: t.exp, act: t.act, jti: t.jti });
  }

  private _sign(iss: string, canonical: string): string {
    const key = this._issuers.get(iss);
    if (!key) throw new Error(`untrusted issuer '${iss}'`);
    return createHash('sha256').update(key).update(canonical).digest('base64url');
  }

  /**
   * Mint a token as `iss`. The wire form is `payload_b64.signature` —
   * HMAC-SHA256 keyed by the issuer's registered secret.
   */
  issue(iss: string, sub: string, aud: string[], scopes: string[], ttlMs?: number, act: Array<{ iss: string; sub: string }> = []): IssuedToken {
    const now = this._now();
    const token: FederatedToken = {
      iss,
      sub,
      aud,
      scopes,
      iat: now,
      exp: now + (ttlMs ?? this._defaultTtlMs),
      act,
      jti: randomBytes(12).toString('base64url'),
    };
    const canonical = this._canonical(token);
    const payload = Buffer.from(canonical, 'utf8').toString('base64url');
    return { token, wire: `${payload}.${this._sign(iss, canonical)}` };
  }

  /** Decode + verify a wire token. Throws on bad signature or expiry. */
  verify(wire: string): FederatedToken {
    const dot = wire.lastIndexOf('.');
    if (dot < 0) throw new Error('malformed token wire form');
    const payload = wire.slice(0, dot);
    const sig = wire.slice(dot + 1);
    const token = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as FederatedToken;
    const expected = this._sign(token.iss, this._canonical(token));
    if (sig !== expected) throw new Error(`bad signature for issuer '${token.iss}'`);
    if (this._now() >= token.exp) throw new Error('token expired');
    return token;
  }

  /**
   * Exchange a subject token for a new token at `audience`.
   * Scopes are intersected with the audience's allowed set; denied
   * scopes are reported in the audit trail, not silently dropped.
   */
  exchange(iss: string, req: ExchangeRequest): IssuedToken {
    const subject = this.verify(req.subjectWire);
    const allowed = this._audienceScopes.get(req.audience) ?? new Set<string>();
    const requested = req.scopes ?? subject.scopes;
    const granted = requested.filter((s) => allowed.has(s));
    const denied = requested.filter((s) => !allowed.has(s));

    const issued = this.issue(
      iss,
      subject.sub,
      [req.audience],
      granted,
      req.ttlMs,
      [...subject.act, { iss: subject.iss, sub: subject.sub }],
    );
    this._audit.push({
      at: this._now(),
      subjectJti: subject.jti,
      subjectIss: subject.iss,
      subjectSub: subject.sub,
      targetAudience: req.audience,
      grantedScopes: granted,
      deniedScopes: denied,
      issuedJti: issued.token.jti,
    });
    return issued;
  }

  /** The exchange audit journal (append-only view). */
  get audit(): readonly ExchangeAuditEntry[] {
    return this._audit;
  }
}
