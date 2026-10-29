/**
 * PasswordHasher
 *
 * Salted password hashing using Node's scrypt KDF. Each password gets a
 * fresh 16-byte random salt; the derived key is stored hex-encoded along
 * with an algorithm descriptor that captures the scrypt cost parameters,
 * so hashes remain verifiable even after parameter upgrades.
 *
 * Verification uses timingSafeEqual to avoid early-exit comparison
 * leaks. `needsRehash` detects credentials computed with weaker
 * parameters so callers can transparently re-hash on next login.
 *
 * @module Identity/Core
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { PasswordCredential, IdentityErrorCode, IdentityCoreError } from './types';

/** Scrypt cost parameters. */
export interface ScryptParams {
  /** CPU/memory cost (power of two). */
  N: number;
  /** Block size. */
  r: number;
  /** Parallelization. */
  p: number;
  /** Derived key length in bytes. */
  keyLen: number;
}

const SALT_BYTES = 16;
const DEFAULT_PARAMS: ScryptParams = { N: 16384, r: 8, p: 1, keyLen: 64 };

export class PasswordHasher {
  private readonly _params: ScryptParams;

  constructor(params?: Partial<ScryptParams>) {
    this._params = { ...DEFAULT_PARAMS, ...params };
    this._validateParams(this._params);
  }

  /** Format the algorithm descriptor embedded in a credential. */
  private _descriptor(p: ScryptParams): string {
    return `scrypt:N=${p.N},r=${p.r},p=${p.p}`;
  }

  private _validateParams(p: ScryptParams): void {
    if (!Number.isInteger(p.N) || p.N < 2 || (p.N & (p.N - 1)) !== 0) {
      throw new IdentityCoreError(IdentityErrorCode.ILLEGAL_TRANSITION, `scrypt N must be a power of two >= 2, got ${p.N}`);
    }
    if (p.r < 1 || p.p < 1 || p.keyLen < 16) {
      throw new IdentityCoreError(IdentityErrorCode.ILLEGAL_TRANSITION, 'invalid scrypt r/p/keyLen');
    }
  }

  /**
   * Parse an algorithm descriptor back into parameters.
   * Returns null if the descriptor is malformed or not scrypt.
   */
  static parseDescriptor(desc: string): ScryptParams | null {
    const m = /^scrypt:N=(\d+),r=(\d+),p=(\d+)$/.exec(desc);
    if (!m) return null;
    // keyLen is not in the descriptor; callers recover it from the stored
    // hex hash length (hash.length / 2).
    return { N: Number(m[1]), r: Number(m[2]), p: Number(m[3]), keyLen: 0 };
  }

  /**
   * Hash a plaintext password with a fresh salt.
   * O(N*r*p) work by design — scrypt is memory-hard.
   */
  hash(password: string, now: number = Date.now()): PasswordCredential {
    const salt = randomBytes(SALT_BYTES);
    const dk = scryptSync(password, salt, this._params.keyLen, {
      N: this._params.N,
      r: this._params.r,
      p: this._params.p,
    });
    return {
      algorithm: this._descriptor(this._params),
      hash: dk.toString('hex'),
      salt: salt.toString('hex'),
      createdAt: now,
    };
  }

  /**
   * Constant-time verification of a plaintext password against a stored
   * credential. Honors the parameters recorded in `credential.algorithm`
   * (falling back to this hasher's params if unparseable) so old hashes
   * still verify after config changes.
   */
  verify(password: string, credential: PasswordCredential): boolean {
    const parsed = PasswordHasher.parseDescriptor(credential.algorithm);
    const p: ScryptParams = parsed
      ? { ...parsed, keyLen: credential.hash.length / 2 }
      : this._params;
    let candidate: Buffer;
    try {
      candidate = scryptSync(password, Buffer.from(credential.salt, 'hex'), p.keyLen, {
        N: p.N,
        r: p.r,
        p: p.p,
      });
    } catch {
      return false;
    }
    const stored = Buffer.from(credential.hash, 'hex');
    if (stored.length !== candidate.length) return false;
    return timingSafeEqual(stored, candidate);
  }

  /**
   * True if a credential was produced with weaker parameters than this
   * hasher's current config (lower N, r, p, or keyLen) — the caller should
   * re-hash the password at next successful authentication.
   */
  needsRehash(credential: PasswordCredential): boolean {
    const parsed = PasswordHasher.parseDescriptor(credential.algorithm);
    if (!parsed) return true;
    const storedKeyLen = credential.hash.length / 2;
    return (
      parsed.N < this._params.N ||
      parsed.r < this._params.r ||
      parsed.p < this._params.p ||
      storedKeyLen < this._params.keyLen
    );
  }
}
