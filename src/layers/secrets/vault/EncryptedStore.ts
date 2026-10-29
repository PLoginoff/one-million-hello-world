/**
 * Secrets Layer — AES-256-GCM Encrypted At-Rest Store
 *
 * In-memory secret store where every value is held as an AES-256-GCM
 * ciphertext envelope — plaintext exists only transiently inside method
 * calls, never in the persisted map. Simulates "encrypted at rest" semantics
 * without external dependencies.
 *
 * Envelope format (Buffer layout):
 *   [12B IV][16B auth tag][ciphertext…]
 *
 * Why GCM: authenticated encryption gives both confidentiality *and*
 * integrity — a corrupted or tampered ciphertext fails `auth` on open
 * rather than decrypting to garbage. Each encryption uses a fresh random
 * IV (GCM's hard requirement: nonce reuse under one key destroys security).
 *
 * The master key is a caller-supplied 32-byte key; a `KeyProvider` function
 * allows key rotation plumbing (the store re-encrypts on `rotateKey`).
 *
 * @module Secrets/Vault
 */

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'crypto';
import { SecretError, SecretErrorCode } from './SecretTypes';

const IV_LEN = 12; // 96-bit nonce — GCM's recommended size
const TAG_LEN = 16; // 128-bit auth tag
const KEY_LEN = 32; // AES-256

export interface EncryptedEnvelope {
  /** Base64 of [IV | tag | ciphertext]. */
  readonly blob: string;
  /** Key identifier the envelope was sealed with (supports rotation). */
  readonly keyId: string;
  /** When sealed (epoch ms). */
  readonly sealedAt: number;
}

export class EncryptedStore {
  private _key: Buffer;
  private _keyId: string;
  private readonly _store = new Map<string, EncryptedEnvelope>();
  private readonly _sealedAt: () => number;

  constructor(key?: Buffer, keyId = 'default', clock: () => number = Date.now) {
    this._key = key ?? randomBytes(KEY_LEN);
    if (this._key.length !== KEY_LEN) {
      throw new SecretError(SecretErrorCode.DECRYPTION_FAILED, `master key must be ${KEY_LEN} bytes`);
    }
    this._keyId = keyId;
    this._sealedAt = clock;
  }

  get keyId(): string {
    return this._keyId;
  }

  get size(): number {
    return this._store.size;
  }

  /** Encrypt and store `plaintext` under `id`. */
  seal(id: string, plaintext: string): void {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv('aes-256-gcm', this._key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const blob = Buffer.concat([iv, tag, ct]).toString('base64');
    this._store.set(id, { blob, keyId: this._keyId, sealedAt: this._sealedAt() });
  }

  /** Decrypt `id`. Throws SecretError on tampered/missing data. */
  open(id: string): string {
    const env = this._store.get(id);
    if (env === undefined) {
      throw new SecretError(SecretErrorCode.NOT_FOUND, `no ciphertext for '${id}'`);
    }
    const buf = Buffer.from(env.blob, 'base64');
    if (buf.length < IV_LEN + TAG_LEN) {
      throw new SecretError(SecretErrorCode.DECRYPTION_FAILED, `envelope for '${id}' is truncated`);
    }
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ct = buf.subarray(IV_LEN + TAG_LEN);
    try {
      const decipher = createDecipheriv('aes-256-gcm', this._key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    } catch {
      throw new SecretError(SecretErrorCode.DECRYPTION_FAILED, `GCM auth failed for '${id}' — tampered or wrong key`);
    }
  }

  /** True when `id` has a stored envelope. */
  has(id: string): boolean {
    return this._store.has(id);
  }

  /** Remove a stored envelope. */
  drop(id: string): boolean {
    return this._store.delete(id);
  }

  /** Inspect the raw envelope (for tests asserting ciphertext ≠ plaintext). */
  envelope(id: string): EncryptedEnvelope | undefined {
    return this._store.get(id);
  }

  /**
   * Rotate the master key: decrypt every envelope with the old key and
   * re-seal with the new one. On any decrypt failure the rotation is aborted
   * midway — envelopes already re-sealed under the new key ID remain valid
   * because the key is swapped atomically at the end (single-writer design).
   */
  rotateKey(newKey: Buffer, newKeyId: string): number {
    if (newKey.length !== KEY_LEN) {
      throw new SecretError(SecretErrorCode.DECRYPTION_FAILED, `master key must be ${KEY_LEN} bytes`);
    }
    const plaintexts = new Map<string, string>();
    for (const id of this._store.keys()) {
      plaintexts.set(id, this.open(id));
    }
    const oldKey = this._key;
    this._key = newKey;
    this._keyId = newKeyId;
    try {
      for (const [id, pt] of plaintexts) this.seal(id, pt);
    } catch (e) {
      this._key = oldKey; // best-effort restore
      throw e;
    }
    return plaintexts.size;
  }

  /**
   * Constant-time comparison helper for callers that need to check a
   * candidate against a sealed value without exposing the plaintext
   * (e.g. verifying a provided credential).
   */
  verify(id: string, candidate: string): boolean {
    const stored = this.open(id);
    const a = Buffer.from(stored, 'utf8');
    const b = Buffer.from(candidate, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  /** All stored ids (envelope keys — not secret paths necessarily). */
  ids(): string[] {
    return Array.from(this._store.keys());
  }

  clear(): void {
    this._store.clear();
  }
}
