/**
 * JwtValidation Engine2 — Shared Types
 *
 * Second-generation JWT validation primitives: JWKS caching with
 * kid-triggered refresh, `cnf` (confirmation) token binding, scope-based
 * authorization, and an RFC 7662 introspection client.
 *
 * @module JwtValidationLayer/Engine2
 */

import { JsonWebKeyObject } from '../jwt/types';

/** Injectable clock for cache TTLs and introspection freshness. */
export interface JwtClock2 {
  now(): number;
}

export class SystemJwtClock2 implements JwtClock2 {
  now(): number {
    return Date.now();
  }
}

/** Test clock with manual time control. */
export class ManualJwtClock2 implements JwtClock2 {
  private _t: number;
  constructor(start: number = 0) {
    this._t = start;
  }
  now(): number {
    return this._t;
  }
  advance(ms: number): void {
    this._t += ms;
  }
  set(ms: number): void {
    this._t = ms;
  }
}

/** A decoded token the engine2 components reason about. */
export interface TokenClaims2 {
  readonly sub?: string;
  readonly iss?: string;
  readonly aud?: string | readonly string[];
  readonly exp?: number;
  readonly iat?: number;
  readonly jti?: string;
  readonly scope?: string;
  readonly scp?: string | readonly string[];
  /** RFC 8700 confirmation claim. */
  readonly cnf?: {
    readonly 'x5t#S256'?: string;
    readonly jkt?: string;
    readonly jwk?: JsonWebKeyObject;
    readonly kid?: string;
  };
  readonly [claim: string]: unknown;
}

/** Decoded JOSE header fields engine2 needs. */
export interface TokenHeader2 {
  readonly alg: string;
  readonly kid?: string;
  readonly typ?: string;
}
