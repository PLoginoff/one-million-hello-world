/**
 * Crypto Shredder — cryptographic erasure via data-key destruction.
 *
 * GDPR "right to be forgotten" and data-retention policies are hard when
 * deletion means scanning every store, backup, and replica for a subject's
 * bytes. Crypto-shredding flips the problem: encrypt everything for a
 * subject under a dedicated DEK, then destroy the DEK. Every ciphertext
 * it ever produced — including copies in backups, logs, replicas, and
 * cold storage — becomes permanently undecryptable in O(1).
 *
 * The shredder keeps an index: keyId → ciphertext handles produced under
 * that key. On shred() it destroys the DEK and reports how many
 * ciphertexts were orphaned. Callers can use the index to *also* delete
 * data where convenient, but correctness doesn't depend on it.
 *
 * Threat notes:
 *  - Destroy is only as strong as the master key's safety: a wrapped DEK
 *    copy elsewhere can resurrect it. The shredder therefore audits the
 *    destroy and the hierarchy wipes its plaintext cache.
 *  - Shred is idempotent and irreversible — both by design.
 *
 * Complexity: shred() is O(1) for the crypto + O(indexed ciphertexts)
 * for bookkeeping.
 *
 * @module EncryptionLayer/Engine2
 */

import { CryptoError, EncryptedEnvelope } from '../crypto/types';
import { KeyHierarchy } from './KeyHierarchy';
import { KeyUsageAudit } from './KeyUsageAudit';
import { IClock, ShredResult, SystemClock } from './types';

export class CryptoShredder {
  private readonly _hierarchy: KeyHierarchy;
  private readonly _audit: KeyUsageAudit;
  private readonly _clock: IClock;

  /** keyId → handles of ciphertexts produced under that key. */
  private readonly _index = new Map<string, Set<string>>();
  /** handle → keyId for reverse lookup. */
  private readonly _byHandle = new Map<string, string>();

  constructor(hierarchy: KeyHierarchy, audit?: KeyUsageAudit, clock: IClock = new SystemClock()) {
    this._hierarchy = hierarchy;
    this._audit = audit ?? hierarchy.audit();
    this._clock = clock;
  }

  /**
   * Encrypt under a scope's DEK *and* register the ciphertext under a
   * caller-supplied handle — the index entry that makes the ciphertext's
   * fate traceable to its key.
   */
  encryptTracked(scope: string, plaintext: string, handle: string, target = scope): EncryptedEnvelope {
    const env = this._hierarchy.encrypt(scope, plaintext, target);
    const keyId = env.kid!;
    let set = this._index.get(keyId);
    if (!set) {
      set = new Set();
      this._index.set(keyId, set);
    }
    set.add(handle);
    this._byHandle.set(handle, keyId);
    return env;
  }

  /**
   * Destroy every DEK for a scope — crypto-shreds all its data.
   * Returns one result per destroyed key.
   */
  shredScope(scope: string, reason = 'crypto-shred'): ShredResult[] {
    const records = this._hierarchy.forScope(scope).filter((r) => r.status !== 'destroyed');
    const results: ShredResult[] = [];
    for (const record of records) {
      results.push(this._shredKey(record.id, reason));
    }
    return results;
  }

  /** Destroy one specific DEK. */
  shredKey(keyId: string, reason = 'crypto-shred'): ShredResult {
    const record = this._hierarchy.record(keyId);
    if (!record) throw new CryptoError('key_not_found', `unknown data key: ${keyId}`);
    if (record.status === 'destroyed') {
      // Idempotent — report the same shape.
      return { keyId, orphanedCiphertexts: this._index.get(keyId)?.size ?? 0, shreddedAt: record.destroyedAt ?? this._clock.now() };
    }
    return this._shredKey(keyId, reason);
  }

  /**
   * Verify a ciphertext is unreadable — probes decrypt() and confirms it
   * throws. Useful in tests and post-shred verification jobs.
   */
  verifyShredded(envelope: EncryptedEnvelope): boolean {
    try {
      this._hierarchy.decrypt(envelope);
      return false;
    } catch {
      return true;
    }
  }

  /** Handles still pointing at a key (post-shred they're orphaned). */
  handlesFor(keyId: string): string[] {
    return [...(this._index.get(keyId) ?? [])];
  }

  /* ---------------------------------------------------------------- */

  private _shredKey(keyId: string, reason: string): ShredResult {
    const handles = this._index.get(keyId) ?? new Set<string>();
    this._hierarchy.destroyDataKey(keyId, reason);
    this._audit.record(keyId, 'destroy', `shredder:${reason}`, `${handles.size} ciphertexts orphaned`);
    return {
      keyId,
      orphanedCiphertexts: handles.size,
      shreddedAt: this._clock.now(),
    };
  }
}
