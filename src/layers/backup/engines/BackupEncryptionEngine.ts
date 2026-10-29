/**
 * Backup Encryption Engine
 *
 * AES-256-GCM encryption for stored blocks, using Node's `crypto`.
 *
 * Wire format per block: [ciphertext bytes] + separate nonce + auth tag
 * (stored as block metadata, like AWS S3 SSE / restic's crypto layout).
 * A fresh random 12-byte nonce is generated per block — GCM is
 * catastrophically broken by nonce reuse, so nonces are never derived or
 * reused. The key is injected; the engine never persists it.
 *
 * @module BackupLayer/Engines
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export interface EncryptedPayload {
  ciphertext: Buffer;
  nonce: Buffer;
  authTag: Buffer;
}

export class BackupEncryptionEngine {
  private readonly _key: Buffer;

  /**
   * @param key 32-byte AES-256 key. The engine copies it defensively;
   *    callers are responsible for key management (KMS, HSM, …).
   */
  constructor(key: Buffer) {
    if (key.length !== 32) {
      throw new Error(`AES-256-GCM requires a 32-byte key, got ${key.length}`);
    }
    this._key = Buffer.from(key);
  }

  /** Generate a fresh random key (for provisioning/tests). */
  static generateKey(): Buffer {
    return randomBytes(32);
  }

  /**
   * Encrypt a plaintext block. A new random nonce per call — never reuse
   * a (key, nonce) pair with GCM.
   */
  encrypt(plaintext: Buffer): EncryptedPayload {
    const nonce = randomBytes(12); // 96-bit nonce, GCM standard
    const cipher = createCipheriv('aes-256-gcm', this._key, nonce);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return { ciphertext, nonce, authTag: cipher.getAuthTag() };
  }

  /**
   * Decrypt a block. Throws on auth-tag mismatch — GCM authenticates
   * ciphertext, so tampered data or a wrong key fails loudly rather than
   * returning garbage.
   */
  decrypt(payload: EncryptedPayload): Buffer {
    const decipher = createDecipheriv('aes-256-gcm', this._key, payload.nonce);
    decipher.setAuthTag(payload.authTag);
    return Buffer.concat([decipher.update(payload.ciphertext), decipher.final()]);
  }
}
