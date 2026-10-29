/**
 * AesGcm — AES-256-GCM authenticated encryption using Node crypto.
 *
 * Output format: EncryptedEnvelope { v, alg, iv, ct, [aadHash], [kid] }.
 * The GCM tag is appended to `ct` (last 16 bytes) — the standard
 * Node/JS arrangement.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { CryptoError, EncryptedEnvelope } from './types';

export const AES_GCM_IV_BYTES = 12;
export const AES_GCM_TAG_BYTES = 16;
export const AES_256_KEY_BYTES = 32;

export class AesGcm {
  /**
   * Encrypt plaintext with a 32-byte key.
   */
  static encrypt(
    key: Buffer,
    plaintext: Buffer | string,
    opts: { aad?: Buffer | string; kid?: string } = {}
  ): EncryptedEnvelope {
    if (key.length !== AES_256_KEY_BYTES) {
      throw new CryptoError('invalid_format', `AES-256 key must be ${AES_256_KEY_BYTES} bytes, got ${key.length}`);
    }
    const iv = randomBytes(AES_GCM_IV_BYTES);
    const pt = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext;
    const aad = opts.aad !== undefined ? (typeof opts.aad === 'string' ? Buffer.from(opts.aad, 'utf8') : opts.aad) : undefined;

    try {
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      if (aad) cipher.setAAD(aad);
      const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
      const tag = cipher.getAuthTag();
      const env: EncryptedEnvelope = {
        v: 1,
        alg: 'A256GCM',
        iv: iv.toString('base64'),
        ct: Buffer.concat([ct, tag]).toString('base64'),
      };
      if (aad) {
        env.aadHash = createHash('sha256').update(aad).digest('base64');
      }
      if (opts.kid) env.kid = opts.kid;
      return env;
    } catch (err) {
      throw new CryptoError('encrypt_failed', `AES-256-GCM encryption failed: ${(err as Error).message}`);
    }
  }

  /**
   * Decrypt an envelope. Validates tag — throws CryptoError('tag_mismatch') on tamper.
   */
  static decrypt(
    key: Buffer,
    env: EncryptedEnvelope,
    opts: { aad?: Buffer | string } = {}
  ): Buffer {
    if (env.alg !== 'A256GCM') {
      throw new CryptoError('invalid_format', `Unsupported cipher: ${env.alg}`);
    }
    if (key.length !== AES_256_KEY_BYTES) {
      throw new CryptoError('invalid_format', `AES-256 key must be ${AES_256_KEY_BYTES} bytes`);
    }
    const iv = Buffer.from(env.iv, 'base64');
    if (iv.length !== AES_GCM_IV_BYTES) {
      throw new CryptoError('invalid_format', `IV must be ${AES_GCM_IV_BYTES} bytes`);
    }
    const fullCt = Buffer.from(env.ct, 'base64');
    if (fullCt.length < AES_GCM_TAG_BYTES + 1) {
      throw new CryptoError('invalid_format', 'Ciphertext too short');
    }
    const ct = fullCt.slice(0, fullCt.length - AES_GCM_TAG_BYTES);
    const tag = fullCt.slice(fullCt.length - AES_GCM_TAG_BYTES);
    const aad = opts.aad !== undefined ? (typeof opts.aad === 'string' ? Buffer.from(opts.aad, 'utf8') : opts.aad) : undefined;

    try {
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      if (aad) decipher.setAAD(aad);
      return Buffer.concat([decipher.update(ct), decipher.final()]);
    } catch (err) {
      // GCM auth failure surfaces as a generic OpenSSL error — map it.
      throw new CryptoError('tag_mismatch', `AES-256-GCM decryption failed (bad key or tampered data): ${(err as Error).message}`);
    }
  }

  /** Convenience — decrypt to UTF-8 string. */
  static decryptToString(key: Buffer, env: EncryptedEnvelope, opts?: { aad?: Buffer | string }): string {
    return this.decrypt(key, env, opts).toString('utf8');
  }
}
