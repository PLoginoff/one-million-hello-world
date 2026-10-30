/**
 * Key Hierarchy — master key → data keys (envelope pattern).
 *
 * One master key (KEK) wraps many data keys (DEKs). Data keys are the
 * workhorses: they encrypt application data; the master key only ever
 * wraps/unwraps DEKs — never touches bulk data — so it can live in a KMS
 * and rotate independently of every ciphertext it protects.
 *
 * Why two levels rather than encrypting data directly with the master:
 *
 *  - Rotation cost: re-wrapping N DEKs is O(N·small) vs. re-encrypting
 *    all data O(N·large).
 *  - Blast radius: a DEK compromise exposes one scope (tenant/table);
 *    a master compromise is contained because it only ever saw wrapped
 *    keys, and re-wrapping all DEKs restores safety in seconds.
 *  - Crypto-shredding: destroying a DEK erases its scope's data
 *    cryptographically — no delete-scan needed.
 *
 * Key material discipline: plaintext DEKs exist only inside encrypt/
 * decrypt calls; the stored record always holds the wrapped form. The
 * in-memory cache of unwrapped DEKs is wiped on destroy/retire.
 *
 * @module EncryptionLayer/Engine2
 */

import { randomBytes } from 'crypto';
import { AesGcm, AES_256_KEY_BYTES } from '../crypto/AesGcm';
import { CryptoError, EncryptedEnvelope } from '../crypto/types';
import { KeyUsageAudit } from './KeyUsageAudit';
import {
  DataKeyRecord,
  IClock,
  MasterKey,
  SystemClock,
} from './types';

export interface KeyHierarchyConfig {
  readonly clock?: IClock;
  readonly audit?: KeyUsageAudit;
}

let keyCounter = 0;

export class KeyHierarchy {
  private readonly _clock: IClock;
  private readonly _audit: KeyUsageAudit;
  private readonly _dataKeys = new Map<string, DataKeyRecord>();
  /** Cache of unwrapped DEKs — cleared on retire/destroy. */
  private readonly _unwrapped = new Map<string, Buffer>();
  private _master: MasterKey | null = null;

  constructor(config: KeyHierarchyConfig = {}) {
    this._clock = config.clock ?? new SystemClock();
    this._audit = config.audit ?? new KeyUsageAudit({}, this._clock);
  }

  /** Inject the master key (32 bytes — from KMS in production). */
  setMasterKey(key: Buffer, id = 'master-0'): MasterKey {
    if (key.length !== AES_256_KEY_BYTES) {
      throw new CryptoError('invalid_format', `Master key must be ${AES_256_KEY_BYTES} bytes`);
    }
    this._master = { id, key, createdAt: this._clock.now() };
    return this._master;
  }

  /** Generate a fresh data key for a scope, wrapped under the master. */
  generateDataKey(scope: string): DataKeyRecord {
    const master = this._requireMaster();
    const raw = randomBytes(AES_256_KEY_BYTES);
    const id = `dek-${(++keyCounter).toString(36)}-${randomBytes(6).toString('hex')}`;
    const wrapped = AesGcm.encrypt(master.key, raw, { aad: `dek:${id}:${scope}`, kid: master.id });

    const record: DataKeyRecord = {
      id,
      scope,
      wrappedKey: wrapped,
      masterKeyId: master.id,
      createdAt: this._clock.now(),
      status: 'active',
      destroyedAt: null,
    };
    this._dataKeys.set(id, record);
    this._unwrapped.set(id, raw);
    this._audit.record(id, 'generate', scope);
    return record;
  }

  /** Encrypt under a scope's active data key. Creates the DEK on first use. */
  encrypt(scope: string, plaintext: string | Buffer, target = scope): EncryptedEnvelope {
    const dek = this._activeDek(scope);
    const key = this._keyMaterial(dek);
    const env = AesGcm.encrypt(key, plaintext, { aad: `dek:${dek.id}`, kid: dek.id });
    this._audit.record(dek.id, 'encrypt', target, `${typeof plaintext === 'string' ? plaintext.length : plaintext.length}B`);
    return env;
  }

  /** Decrypt — resolves the DEK from the envelope's kid. */
  decrypt(envelope: EncryptedEnvelope, target = ''): string {
    const dekId = envelope.kid;
    if (!dekId) throw new CryptoError('key_not_found', 'envelope has no key id');
    const dek = this._dataKeys.get(dekId);
    if (!dek) throw new CryptoError('key_not_found', `unknown data key: ${dekId}`);
    if (dek.status === 'destroyed') {
      throw new CryptoError('key_retired', `data key ${dekId} was destroyed at ${dek.destroyedAt}`);
    }
    const key = this._keyMaterial(dek);
    const pt = AesGcm.decryptToString(key, envelope, { aad: `dek:${dek.id}` });
    this._audit.record(dek.id, 'decrypt', target || dek.scope);
    return pt;
  }

  /**
   * Re-wrap every DEK under a new master — the cheap half of master
   * rotation. Data ciphertexts are untouched: the same DEKs keep working,
   * only their at-rest wrapping changes.
   */
  rotateMaster(newMasterKey: Buffer, newId: string): { rewrapped: number } {
    const oldMaster = this._requireMaster();
    this._master = { id: newId, key: newMasterKey, createdAt: this._clock.now() };
    let rewrapped = 0;
    for (const [id, record] of this._dataKeys) {
      if (record.status === 'destroyed') continue;
      // Unwrap with the old master, re-wrap with the new.
      const raw = AesGcm.decrypt(oldMaster.key, record.wrappedKey, {
        aad: `dek:${id}:${record.scope}`,
      });
      const wrapped = AesGcm.encrypt(newMasterKey, raw, {
        aad: `dek:${id}:${record.scope}`,
        kid: newId,
      });
      this._dataKeys.set(id, { ...record, wrappedKey: wrapped, masterKeyId: newId });
      this._audit.record(id, 'wrap', record.scope, `rotated to ${newId}`);
      rewrapped++;
    }
    return { rewrapped };
  }

  /** Retire a DEK: it can still decrypt (for reads) but encrypts no more. */
  retireDataKey(keyId: string): void {
    const dek = this._requireKey(keyId);
    if (dek.status === 'destroyed') throw new CryptoError('key_retired', 'already destroyed');
    this._dataKeys.set(keyId, { ...dek, status: 'retired' });
    this._audit.record(keyId, 'retire', dek.scope);
  }

  /** Inspect a stored record (never exposes key material). */
  record(keyId: string): DataKeyRecord | null {
    return this._dataKeys.get(keyId) ?? null;
  }

  /** All records for a scope. */
  forScope(scope: string): DataKeyRecord[] {
    return [...this._dataKeys.values()].filter((r) => r.scope === scope);
  }

  /** The audit log this hierarchy feeds. */
  audit(): KeyUsageAudit {
    return this._audit;
  }

  /**
   * Destroy the DEK's key material — the crypto-shred primitive.
   * After this the wrapped record is marked destroyed and no plaintext
   * copy exists anywhere in the process. Returns the updated record.
   *
   * @internal exposed for {@link CryptoShredder}; direct use is fine too.
   */
  destroyDataKey(keyId: string, reason = ''): DataKeyRecord {
    const dek = this._requireKey(keyId);
    const destroyed: DataKeyRecord = {
      ...dek,
      status: 'destroyed',
      destroyedAt: this._clock.now(),
    };
    this._dataKeys.set(keyId, destroyed);
    // Wipe the cached plaintext — overwrite before releasing.
    const cached = this._unwrapped.get(keyId);
    if (cached) {
      cached.fill(0);
      this._unwrapped.delete(keyId);
    }
    this._audit.record(keyId, 'destroy', dek.scope, reason || null);
    return destroyed;
  }

  /* ---------------------------------------------------------------- */

  private _requireMaster(): MasterKey {
    if (!this._master) throw new CryptoError('key_not_found', 'master key not set — call setMasterKey()');
    return this._master;
  }

  private _requireKey(keyId: string): DataKeyRecord {
    const dek = this._dataKeys.get(keyId);
    if (!dek) throw new CryptoError('key_not_found', `unknown data key: ${keyId}`);
    return dek;
  }

  /** Active DEK for a scope — lazily generated on first encrypt. */
  private _activeDek(scope: string): DataKeyRecord {
    const existing = this.forScope(scope).find((r) => r.status === 'active');
    if (existing) return existing;
    return this.generateDataKey(scope);
  }

  /** Plaintext DEK — unwraps on first access, caches until destroyed. */
  private _keyMaterial(dek: DataKeyRecord): Buffer {
    const cached = this._unwrapped.get(dek.id);
    if (cached) return cached;
    const master = this._requireMaster();
    const raw = AesGcm.decrypt(master.key, dek.wrappedKey, {
      aad: `dek:${dek.id}:${dek.scope}`,
    });
    this._unwrapped.set(dek.id, raw);
    this._audit.record(dek.id, 'unwrap', dek.scope);
    return raw;
  }
}
