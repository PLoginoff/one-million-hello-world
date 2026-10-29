/**
 * CredentialVault — field-level encryption for PII at rest.
 *
 * Wraps sensitive profile attributes (SSN, DOB, recovery answers) in
 * AES-256-GCM envelopes keyed off a tenant master key. Per-field random
 * IV; the attribute name is bound as AAD so ciphertexts can't be
 * transplanted between fields.
 *
 * Envelope format: "v1:<base64url(iv)>:<base64url(ct+tag)>"
 *
 * Key versioning: the vault holds a map kid->key; encryption uses the
 * `activeKid`; decryption resolves kid from the envelope header so old
 * fields remain readable after rotation. `reencrypt` re-wraps a field
 * under the current active key.
 *
 * @module Identity/Core
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { IdentityCoreError, IdentityErrorCode } from './types';

const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface VaultKey {
  kid: string;
  /** 32-byte AES-256 key material. */
  key: Buffer;
  createdAt: number;
}

export class CredentialVault {
  private readonly _keys: Map<string, VaultKey> = new Map();
  private _activeKid: string | null = null;

  /** Install a key and (optionally) make it active for new writes. */
  addKey(kid: string, key: Buffer, activate = true, now: number = Date.now()): void {
    if (key.length !== 32) {
      throw new IdentityCoreError(IdentityErrorCode.ILLEGAL_TRANSITION, 'vault keys must be 32 bytes');
    }
    this._keys.set(kid, { kid, key, createdAt: now });
    if (activate || this._activeKid === null) this._activeKid = kid;
  }

  /** Derive a 32-byte vault key from passphrase material (dev helper). */
  static deriveKey(material: string): Buffer {
    return createHash('sha256').update(material).digest();
  }

  /**
   * Encrypt a field value. `fieldName` is bound as AAD — the ciphertext
   * cannot be replayed under a different attribute.
   */
  encrypt(fieldName: string, plaintext: string): string {
    if (this._activeKid === null) {
      throw new IdentityCoreError(IdentityErrorCode.ILLEGAL_TRANSITION, 'vault has no active key');
    }
    const { kid, key } = this._keys.get(this._activeKid)!;
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(`${kid}|${fieldName}`, 'utf8'));
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${kid}:${iv.toString('base64url')}:${Buffer.concat([ct, tag]).toString('base64url')}`;
  }

  /** Decrypt an envelope under the named field. Throws on tamper. */
  decrypt(fieldName: string, envelope: string): string {
    const parts = envelope.split(':');
    if (parts.length !== 4 || parts[0] !== 'v1') {
      throw new IdentityCoreError(IdentityErrorCode.TOKEN_INVALID, 'malformed vault envelope');
    }
    const [, kid, ivB64, ctB64] = parts;
    const k = this._keys.get(kid);
    if (!k) {
      throw new IdentityCoreError(IdentityErrorCode.TOKEN_INVALID, `unknown vault key ${kid}`);
    }
    const raw = Buffer.from(ctB64, 'base64url');
    const ct = raw.subarray(0, raw.length - TAG_BYTES);
    const tag = raw.subarray(raw.length - TAG_BYTES);
    try {
      const decipher = createDecipheriv('aes-256-gcm', k.key, Buffer.from(ivB64, 'base64url'));
      decipher.setAAD(Buffer.from(`${kid}|${fieldName}`, 'utf8'));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    } catch {
      throw new IdentityCoreError(IdentityErrorCode.TOKEN_INVALID, 'vault envelope authentication failed');
    }
  }

  /** Is a value a vault envelope? */
  static isEnvelope(v: unknown): v is string {
    return typeof v === 'string' && v.startsWith('v1:');
  }

  /** Re-encrypt an envelope under the active key (rotation support). */
  reencrypt(fieldName: string, envelope: string): string {
    const pt = this.decrypt(fieldName, envelope);
    return this.encrypt(fieldName, pt);
  }

  /** Kid of the key currently used for new writes. */
  get activeKid(): string | null {
    return this._activeKid;
  }

  /**
   * Encrypt a whole attribute map: values listed in `sensitiveFields`
   * are wrapped; others pass through. Returns a new map.
   */
  encryptAttributes(attrs: Record<string, unknown>, sensitiveFields: string[]): Record<string, unknown> {
    const out: Record<string, unknown> = { ...attrs };
    for (const f of sensitiveFields) {
      if (out[f] !== undefined && !CredentialVault.isEnvelope(out[f])) {
        out[f] = this.encrypt(f, String(out[f]));
      }
    }
    return out;
  }

  /** Inverse of encryptAttributes for reads. */
  decryptAttributes(attrs: Record<string, unknown>, sensitiveFields: string[]): Record<string, unknown> {
    const out: Record<string, unknown> = { ...attrs };
    for (const f of sensitiveFields) {
      if (CredentialVault.isEnvelope(out[f])) {
        out[f] = this.decrypt(f, out[f] as string);
      }
    }
    return out;
  }
}
