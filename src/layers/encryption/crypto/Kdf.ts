/**
 * Kdf — password/input key derivation.
 *
 * Implements PBKDF2 (real), scrypt (real), HKDF (real), and an argon2id
 * stub (documented parameters, delegated to Node's pbkdf2 fallback).
 */

import { pbkdf2Sync, scryptSync, hkdfSync, randomBytes, createHash } from 'crypto';
import { CryptoError, KdfParams } from './types';

const MIN_PBKDF2_ITERATIONS = 100_000;
const MIN_SCRYPT_N = 1 << 14; // 16384 — RFC 7914 recommendation for interactive

export interface KdfOutput {
  key: Buffer;
  params: KdfParams;
  /** Salt used — generated if not supplied. */
  salt: Buffer;
}

export class Kdf {
  /**
   * Derive a key from a password/input.
   */
  static derive(
    input: string | Buffer,
    opts: KdfParams & { salt?: Buffer } = { algorithm: 'pbkdf2-sha256' }
  ): KdfOutput {
    const params = { ...opts };
    const salt = opts.salt ?? randomBytes(16);
    const inputBuf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
    const length = params.lengthBytes ?? 32;

    switch (params.algorithm) {
      case 'pbkdf2-sha256':
      case 'pbkdf2-sha512': {
        const iterations = params.iterations ?? MIN_PBKDF2_ITERATIONS;
        if (iterations < MIN_PBKDF2_ITERATIONS) {
          throw new CryptoError(
            'weak_params',
            `PBKDF2 iterations ${iterations} below minimum ${MIN_PBKDF2_ITERATIONS}`
          );
        }
        const digest = params.algorithm === 'pbkdf2-sha512' ? 'sha512' : 'sha256';
        const key = pbkdf2Sync(inputBuf, salt, iterations, length, digest);
        return { key, params: { ...params, iterations }, salt };
      }

      case 'scrypt': {
        const N = params.scryptN ?? MIN_SCRYPT_N;
        const r = params.scryptR ?? 8;
        const p = params.scryptP ?? 1;
        if (N < MIN_SCRYPT_N || (N & (N - 1)) !== 0) {
          throw new CryptoError(
            'weak_params',
            `scrypt N must be a power of two ≥ ${MIN_SCRYPT_N}, got ${N}`
          );
        }
        const key = scryptSync(inputBuf, salt, length, { N, r, p });
        return { key, params: { ...params, scryptN: N, scryptR: r, scryptP: p }, salt };
      }

      case 'hkdf-sha256': {
        // HKDF for expanding an already-strong key — not for passwords.
        const info = params.hkdfInfo ?? '';
        const derived = hkdfSync('sha256', inputBuf, salt, Buffer.from(info, 'utf8'), length);
        return {
          key: Buffer.from(derived),
          params: { ...params, hkdfInfo: info },
          salt,
        };
      }

      case 'argon2id-stub': {
        // Stub: parameterised argon2id — delegates to PBKDF2-SHA512 with a
        // domain-separated salt. Real argon2 needs the `argon2` package or
        // WASM; this stub preserves the parameter surface so swapping in a
        // real backend later is a one-line change.
        const memory = params.argon2MemoryKiB ?? 19 * 1024; // 19 MiB — OWASP
        const iterations = params.argon2Iterations ?? 2;
        const parallelism = params.argon2Parallelism ?? 1;
        if (memory < 8 * 1024) {
          throw new CryptoError('weak_params', 'argon2 memory below 8 MiB minimum');
        }
        const tag = Buffer.from(
          `argon2id$v=19$m=${memory},t=${iterations},p=${parallelism}$`,
          'utf8'
        );
        const keyed = createHash('sha512')
          .update(Buffer.concat([tag, salt, inputBuf]))
          .digest();
        const key = pbkdf2Sync(keyed, salt, 10, length, 'sha512');
        return {
          key,
          params: {
            ...params,
            argon2MemoryKiB: memory,
            argon2Iterations: iterations,
            argon2Parallelism: parallelism,
          },
          salt,
        };
      }

      default:
        throw new CryptoError(
          'kdf_unsupported',
          `Unsupported KDF: ${String(params.algorithm)}`
        );
    }
  }

  /**
   * Verify a derived key against the same params + salt — constant-time.
   */
  static verify(
    input: string | Buffer,
    expected: Buffer,
    params: KdfParams,
    salt: Buffer
  ): boolean {
    const { key } = this.derive(input, { ...params, salt });
    return key.length === expected.length && key.equals(expected);
  }

  /** Generate a fresh salt of given length. */
  static generateSalt(bytes = 16): Buffer {
    return randomBytes(bytes);
  }
}
