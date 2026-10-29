/**
 * KeyRing — envelope encryption: Data Encryption Keys (DEKs) wrapped by a
 * Key Encryption Key (KEK). Supports key rotation.
 *
 * Layout per ciphertext record:
 *   { wrappedDek: EncryptedEnvelope, data: EncryptedEnvelope }
 * The DEK is generated per record, wrapped with the KEK (which lives in
 * the ring), and discarded.
 */

import { randomBytes, createHash } from 'crypto';
import { AesGcm } from './AesGcm';
import { CryptoError, EncryptedEnvelope } from './types';

export interface WrappedRecord {
  /** DEK encrypted under the KEK. */
  wrappedDek: EncryptedEnvelope;
  /** Data encrypted under the DEK. */
  data: EncryptedEnvelope;
  /** KEK id used for wrapping (for rotation). */
  kekKid: string;
}

export interface Kek {
  kid: string;
  key: Buffer;
  createdAtMs: number;
  status: 'active' | 'retired';
  retiredAtMs?: number;
}

export class KeyRing {
  private keks: Kek[] = [];
  private readonly now: () => number;

  constructor(opts: { now?: () => number } = {}) {
    this.now = opts.now ?? (() => Date.now());
  }

  /** Generate a fresh KEK and mark it active (retires previous). */
  rotateKek(kid?: string): Kek {
    const nowMs = this.now();
    for (const k of this.keks) {
      if (k.status === 'active') {
        k.status = 'retired';
        k.retiredAtMs = nowMs;
      }
    }
    const kek: Kek = {
      kid: kid ?? `kek-${nowMs.toString(36)}-${randomBytes(4).toString('hex')}`,
      key: randomBytes(32),
      createdAtMs: nowMs,
      status: 'active',
    };
    this.keks.push(kek);
    return kek;
  }

  /** Load an externally-managed KEK (e.g. fetched from KMS). */
  importKek(key: Buffer, kid: string, status: 'active' | 'retired' = 'active'): Kek {
    if (key.length !== 32) {
      throw new CryptoError('invalid_format', 'KEK must be 32 bytes');
    }
    if (status === 'active') {
      for (const k of this.keks) k.status = 'retired';
    }
    const kek: Kek = { kid, key, createdAtMs: this.now(), status };
    this.keks = this.keks.filter((k) => k.kid !== kid).concat(kek);
    return kek;
  }

  /** Active KEK — generates one on first use. */
  activeKek(): Kek {
    const active = this.keks.find((k) => k.status === 'active');
    return active ?? this.rotateKek();
  }

  /** All KEKs that can unwrap (active + retired). */
  unwrapKeks(): Kek[] {
    return this.keks.slice();
  }

  /* ---------------------- envelope encryption ---------------------- */

  /**
   * Encrypt under a fresh DEK, wrap the DEK with the active KEK.
   */
  seal(plaintext: Buffer | string, opts: { aad?: Buffer | string } = {}): WrappedRecord {
    const kek = this.activeKek();
    const dek = randomBytes(32);
    const data = AesGcm.encrypt(dek, plaintext, { aad: opts.aad });
    const wrappedDek = AesGcm.encrypt(kek.key, dek, {
      aad: `kek:${kek.kid}`,
      kid: kek.kid,
    });
    return { wrappedDek, data, kekKid: kek.kid };
  }

  /**
   * Unwrap a record: decrypt the DEK with the KEK that produced it,
   * then decrypt the data.
   */
  open(record: WrappedRecord, opts: { aad?: Buffer | string } = {}): Buffer {
    const kek = this.keks.find((k) => k.kid === record.kekKid);
    if (!kek) {
      throw new CryptoError('key_not_found', `No KEK for kid ${record.kekKid}`);
    }
    const dek = AesGcm.decrypt(kek.key, record.wrappedDek, { aad: `kek:${kek.kid}` });
    if (dek.length !== 32) {
      throw new CryptoError('decrypt_failed', 'Unwrapped DEK has unexpected size');
    }
    return AesGcm.decrypt(dek, record.data, { aad: opts.aad });
  }

  /**
   * Re-wrap a record's DEK under the current active KEK (rotation).
   * The data ciphertext is untouched.
   */
  rewrap(record: WrappedRecord): WrappedRecord {
    const oldKek = this.keks.find((k) => k.kid === record.kekKid);
    if (!oldKek) {
      throw new CryptoError('key_not_found', `No KEK for kid ${record.kekKid}`);
    }
    const dek = AesGcm.decrypt(oldKek.key, record.wrappedDek, { aad: `kek:${oldKek.kid}` });
    const newKek = this.activeKek();
    const wrappedDek = AesGcm.encrypt(newKek.key, dek, {
      aad: `kek:${newKek.kid}`,
      kid: newKek.kid,
    });
    return { wrappedDek, data: record.data, kekKid: newKek.kid };
  }

  /* ------------------------------ info ------------------------------ */

  describe(): Array<{ kid: string; status: string; ageMs: number }> {
    const now = this.now();
    return this.keks.map((k) => ({ kid: k.kid, status: k.status, ageMs: now - k.createdAtMs }));
  }

  /** Fingerprint of the active KEK — never the raw key. */
  activeKekFingerprint(): string {
    const kek = this.activeKek();
    return createHash('sha256').update(kek.key).digest('hex').slice(0, 16);
  }
}
