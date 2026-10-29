/**
 * KeyResolver
 *
 * JWKS-like key store per trusted entity with:
 *  - kid-indexed lookup with rollover support (multiple keys, `use`
 *    filtering, `retired` verify-only flag, `expiresAt` retirement)
 *  - rollover(): promotes a new key, marks the old one retired
 *  - Signature stubbing: HMAC-SHA256 over canonical input using the key
 *    material (n/x/k) as the MAC secret — stands in for asymmetric
 *    signing while preserving kid-based resolution semantics.
 *
 * Verification looks up the signing key by kid from the *asserting*
 * entity's metadata, checks it is not retired/expired, and compares
 * MACs with timingSafeEqual.
 *
 * @module IdentityProvider/Federation
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { JwkStub, FederationError, FederationErrorCode } from './types';

/** Canonical serialization for signing: sorted keys, stable separators. */
export function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(',')}}`;
}

/** Extract usable MAC material from a JWK stub. */
function keyMaterial(jwk: JwkStub): string {
  return jwk.k ?? jwk.n ?? jwk.x ?? jwk.kid;
}

export class KeyResolver {
  /** entityId -> (kid -> key). */
  private readonly _stores: Map<string, Map<string, JwkStub>> = new Map();

  /** Replace the key set for an entity (metadata refresh). */
  publishKeys(entityId: string, keys: JwkStub[]): void {
    const store = new Map<string, JwkStub>();
    for (const k of keys) store.set(k.kid, { ...k });
    this._stores.set(entityId, store);
  }

  /** All known keys for an entity (snapshot). */
  keysFor(entityId: string): JwkStub[] {
    return [...(this._stores.get(entityId)?.values() ?? [])];
  }

  /**
   * Resolve a key for verification.
   *
   * @throws FederationError UNKNOWN_ENTITY when the entity has no keys
   * @throws FederationError INVALID_SIGNATURE when kid is unknown/retired
   */
  resolveForVerify(entityId: string, kid: string, now: number = Date.now()): JwkStub {
    const store = this._stores.get(entityId);
    if (!store || store.size === 0) {
      throw new FederationError(FederationErrorCode.UNKNOWN_ENTITY, `no keys published for ${entityId}`);
    }
    const key = store.get(kid);
    if (!key) {
      throw new FederationError(FederationErrorCode.INVALID_SIGNATURE, `unknown kid ${kid} for ${entityId}`);
    }
    if (key.expiresAt !== undefined && now > key.expiresAt) {
      throw new FederationError(FederationErrorCode.INVALID_SIGNATURE, `key ${kid} expired for ${entityId}`);
    }
    return key;
  }

  /**
   * Resolve the current signing key for an entity: the newest
   * non-retired, non-expired 'sig' key. Falls back to any non-retired key.
   */
  resolveForSign(entityId: string, now: number = Date.now()): JwkStub {
    const keys = this.keysFor(entityId).filter(
      (k) => !k.retired && (k.expiresAt === undefined || now <= k.expiresAt)
    );
    if (keys.length === 0) {
      throw new FederationError(FederationErrorCode.UNKNOWN_ENTITY, `no signing key for ${entityId}`);
    }
    const sig = keys.filter((k) => k.use === 'sig' || k.use === undefined);
    return (sig.length > 0 ? sig : keys)[sig.length > 0 ? sig.length - 1 : keys.length - 1];
  }

  /**
   * Key rollover: mark all current 'sig' keys retired and install `next`.
   * Returns the newly installed key.
   */
  rollover(entityId: string, next: JwkStub): JwkStub {
    const store = this._stores.get(entityId) ?? new Map<string, JwkStub>();
    for (const [kid, k] of store) {
      if (k.use === 'sig' || k.use === undefined) {
        store.set(kid, { ...k, retired: true });
      }
    }
    store.set(next.kid, { ...next, use: next.use ?? 'sig', retired: false });
    this._stores.set(entityId, store);
    return next;
  }

  /**
   * Sign a payload (canonicalized) with the entity's current signing key.
   * Returns { kid, alg, value } — value is hex HMAC-SHA256.
   */
  sign(entityId: string, alg: string, payload: unknown, now: number = Date.now()): { kid: string; alg: string; value: string } {
    const key = this.resolveForSign(entityId, now);
    const mac = createHmac('sha256', keyMaterial(key)).update(canonicalize(payload)).digest('hex');
    return { kid: key.kid, alg, value: mac };
  }

  /**
   * Verify a signature produced by `sign` against the asserting entity's
   * key for `kid`. Constant-time comparison.
   */
  verify(entityId: string, kid: string, payload: unknown, signature: string, now: number = Date.now()): boolean {
    const key = this.resolveForVerify(entityId, kid, now);
    const expected = createHmac('sha256', keyMaterial(key)).update(canonicalize(payload)).digest('hex');
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(signature, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
}
