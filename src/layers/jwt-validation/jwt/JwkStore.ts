/**
 * JwkStore — JSON Web Key set handling.
 *
 * Holds a keyset, resolves keys by `kid` + algorithm, and supports
 * refresh from a remote JWKS endpoint.
 */

import {
  isJwkSet,
  JsonWebKeyObject,
  JwkSet,
  JwtAlgorithm,
  JwtTokenError,
} from './types';

export interface JwkFetchOptions {
  /** Max number of keys to accept from a fetched set (DoS guard). */
  maxKeys?: number;
  /** Reject a set missing `keys` array. */
  strict?: boolean;
}

export interface JwkResolution {
  jwk: JsonWebKeyObject;
  kid?: string;
}

export class JwkStore {
  private keys: JsonWebKeyObject[] = [];
  private readonly maxKeys: number;

  constructor(initial?: JsonWebKeyObject[] | JwkSet, opts: JwkFetchOptions = {}) {
    this.maxKeys = opts.maxKeys ?? 64;
    if (initial) {
      const arr = Array.isArray(initial) ? initial : initial.keys;
      this.importKeys(arr);
    }
  }

  /** Number of keys currently held. */
  get size(): number {
    return this.keys.length;
  }

  /** List of known key IDs. */
  keyIds(): string[] {
    return this.keys.map((k) => k.kid ?? '').filter((k) => k.length > 0);
  }

  /** Import raw JWK objects, replacing the current set. */
  importKeys(keys: JsonWebKeyObject[]): void {
    if (keys.length > this.maxKeys) {
      throw new JwtTokenError(
        'key_not_found',
        `JWK set too large (${keys.length} > ${this.maxKeys})`
      );
    }
    this.keys = keys.slice();
  }

  /** Parse + import a JWKS JSON document. */
  importJwksJson(json: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (err) {
      throw new JwtTokenError('key_not_found', `Invalid JWKS JSON: ${(err as Error).message}`);
    }
    if (!isJwkSet(parsed)) {
      throw new JwtTokenError('key_not_found', 'Document is not a valid JWKS');
    }
    this.importKeys(parsed.keys);
  }

  /** Add or replace a single key. */
  addKey(jwk: JsonWebKeyObject): void {
    if (jwk.kid) {
      this.keys = this.keys.filter((k) => k.kid !== jwk.kid);
    }
    if (this.keys.length >= this.maxKeys) {
      this.keys.shift();
    }
    this.keys.push(jwk);
  }

  /** Remove a key by kid. Returns true if a key was removed. */
  removeKey(kid: string): boolean {
    const before = this.keys.length;
    this.keys = this.keys.filter((k) => k.kid !== kid);
    return this.keys.length !== before;
  }

  /**
   * Resolve a key for a token.
   * - If `kid` given: prefer exact kid match.
   * - If `alg` given: prefer keys whose `alg` matches.
   * - Fallbacks: first key with matching `use` ('sig' or undefined) and kty
   *   compatible with the algorithm family.
   */
  resolve(kid: string | undefined, alg: JwtAlgorithm): JwkResolution | null {
    const familyKty = this.expectedKty(alg);

    const candidates = this.keys.filter((k) => {
      if (k.use && k.use !== 'sig') return false;
      if (k.alg && k.alg !== alg) return false;
      return k.kty === familyKty;
    });

    if (kid !== undefined) {
      const exact = candidates.find((k) => k.kid === kid);
      if (exact) return { jwk: exact, kid: exact.kid };
      // Kid specified but not found — in strict mode return null. If the
      // set has only one key of the right type, fall back to it (some IdPs
      // omit kid).
      if (candidates.length === 1) {
        return { jwk: candidates[0], kid: candidates[0].kid };
      }
      return null;
    }

    if (candidates.length > 0) {
      return { jwk: candidates[0], kid: candidates[0].kid };
    }
    return null;
  }

  /** All keys matching a given `kty` (RSA/EC/OKP/oct). */
  byKty(kty: string): JsonWebKeyObject[] {
    return this.keys.filter((k) => k.kty === kty);
  }

  /** Expected kty for an algorithm family. */
  private expectedKty(alg: JwtAlgorithm): string {
    switch (alg) {
      case 'RS256':
      case 'RS384':
      case 'RS512':
      case 'PS256':
      case 'PS384':
      case 'PS512':
        return 'RSA';
      case 'ES256':
      case 'ES384':
      case 'ES512':
        return 'EC';
      case 'EdDSA':
        return 'OKP';
      case 'HS256':
      case 'HS384':
      case 'HS512':
        return 'oct';
      default:
        return 'RSA';
    }
  }

  /** Serialise current store back to a JWKS document. */
  toJwks(): JwkSet {
    return { keys: this.keys.slice() };
  }
}
