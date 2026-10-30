/**
 * Engine2 shared types — key hierarchy, usage audit, crypto-shredding,
 * and blind indexing.
 *
 * Envelope pattern:
 *
 *   MasterKey (KEK, held in HSM/KMS or injected)
 *     └─ wraps ─▶ DataKey (DEK, per purpose/tenant)
 *                   └─ encrypts ─▶ application data
 *
 * DataKey material only exists in memory inside {@link KeyHierarchy};
 * at rest it is always stored wrapped (encrypted under the master key).
 * Crypto-shredding = destroying the DEK, which renders every ciphertext
 * it produced permanently undecryptable without touching the data itself.
 *
 * @module EncryptionLayer/Engine2
 */

import { EncryptedEnvelope } from '../crypto/types';

/** Injectable clock. */
export interface IClock {
  now(): number;
}

export class SystemClock implements IClock {
  now(): number {
    return Date.now();
  }
}

export class TestClock implements IClock {
  private _current: number;
  constructor(start = 0) {
    this._current = start;
  }
  now(): number {
    return this._current;
  }
  advance(ms: number): void {
    this._current += ms;
  }
  set(ms: number): void {
    this._current = ms;
  }
}

/* ------------------------------------------------------------------ */
/* Key hierarchy                                                       */
/* ------------------------------------------------------------------ */

export type DataKeyStatus = 'active' | 'retired' | 'destroyed';

/**
 * A data key as stored: key material is only ever present *wrapped*
 * (encrypted under the master key). The plaintext key never leaves the
 * hierarchy except transiently inside encrypt/decrypt calls.
 */
export interface DataKeyRecord {
  readonly id: string;
  /** What this key protects — tenant id, table name, purpose tag. */
  readonly scope: string;
  /** Wrapped (encrypted) key material — safe to persist. */
  readonly wrappedKey: EncryptedEnvelope;
  /** Master key id that wrapped this key. */
  readonly masterKeyId: string;
  readonly createdAt: number;
  readonly status: DataKeyStatus;
  readonly destroyedAt: number | null;
}

export interface MasterKey {
  readonly id: string;
  /** Raw 32-byte KEK. In production this lives in a KMS — injected here. */
  readonly key: Buffer;
  readonly createdAt: number;
}

/* ------------------------------------------------------------------ */
/* Usage audit                                                         */
/* ------------------------------------------------------------------ */

export type KeyOperation = 'generate' | 'wrap' | 'unwrap' | 'encrypt' | 'decrypt' | 'retire' | 'destroy' | 'index';

export interface KeyUsageEvent {
  readonly keyId: string;
  readonly operation: KeyOperation;
  /** What was protected — record id, field path, table — caller-defined. */
  readonly target: string;
  readonly at: number;
  /** Freeform detail (e.g. bytes encrypted, reason for destroy). */
  readonly detail: string | null;
}

/** Per-key rollup for audit reports. */
export interface KeyUsageSummary {
  readonly keyId: string;
  readonly totalOps: number;
  readonly byOperation: Readonly<Record<string, number>>;
  /** Distinct targets this key touched. */
  readonly targets: readonly string[];
  readonly firstUsed: number;
  readonly lastUsed: number;
}

/* ------------------------------------------------------------------ */
/* Crypto-shredding                                                    */
/* ------------------------------------------------------------------ */

export interface ShredResult {
  readonly keyId: string;
  /** Records in the shredder's ciphertext index that became unreadable. */
  readonly orphanedCiphertexts: number;
  readonly shreddedAt: number;
}

/* ------------------------------------------------------------------ */
/* Blind index                                                         */
/* ------------------------------------------------------------------ */

/** Normalisation applied before hashing — keeps the index deterministic. */
export type Normalizer = (value: string) => string;

/**
 * A blind-index entry: the HMAC of a normalised plaintext under a
 * dedicated index key. Equality search works because HMAC is
 * deterministic — same plaintext → same tag — while the tag itself
 * reveals nothing about the plaintext (HMAC is a PRF).
 */
export interface BlindIndex {
  /** Index key id — separate from any data key, dedicated purpose. */
  readonly keyId: string;
  /** Field this index covers (e.g. "users.email"). */
  readonly field: string;
  /** Normaliser applied before hashing — e.g. lowercase + trim. */
  readonly normalizerName: string;
}
