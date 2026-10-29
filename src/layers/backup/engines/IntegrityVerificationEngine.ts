/**
 * Integrity Verification Engine
 *
 * Deep-verifies a restore point: re-hashes every referenced block and
 * compares it to the content address, re-computes the manifest checksum,
 * and reports missing/corrupt/tampered state.
 *
 * For encrypted blocks, verification decrypts first (GCM auth tag
 * already guarantees ciphertext integrity) and then hashes the plaintext
 * — the strongest end-to-end check available.
 *
 * Run periodically (or before a restore) to catch bit-rot and tampering
 * before they matter — the "verify your backups or you don't have
 * backups" rule.
 *
 * @module BackupLayer/Engines
 */

import { IntegrityReport, RestorePoint, sha256 } from './types';
import { BlockStorageEngine } from './BlockStorageEngine';
import { BackupEncryptionEngine } from './BackupEncryptionEngine';

export class IntegrityVerificationEngine {
  private readonly _storage: BlockStorageEngine;
  private readonly _encryption: BackupEncryptionEngine | null;

  constructor(storage: BlockStorageEngine, encryption: BackupEncryptionEngine | null = null) {
    this._storage = storage;
    this._encryption = encryption;
  }

  /**
   * Verify one restore point end-to-end.
   *
   * Checks performed per object:
   *  1. every referenced block exists in the store;
   *  2. each block's plaintext re-hashes to its content address;
   *  3. reassembled object hashes to its recorded checksum;
   *  4. the whole manifest re-hashes to `manifestChecksum`.
   */
  verify(rp: RestorePoint): IntegrityReport {
    const missing: string[] = [];
    const corrupt: string[] = [];
    let verified = 0;
    const seen = new Set<string>();

    for (const obj of rp.objects) {
      const parts: Buffer[] = [];
      let objectOk = true;
      for (const hash of obj.blockHashes) {
        const block = this._storage.get(hash);
        if (!block) {
          if (!seen.has(hash)) {
            missing.push(hash);
            seen.add(hash);
          }
          objectOk = false;
          continue;
        }
        try {
          const plaintext =
            block.encrypted && this._encryption
              ? this._encryption.decrypt({
                  ciphertext: block.data,
                  nonce: block.nonce!,
                  authTag: block.authTag!,
                })
              : block.encrypted
                ? null // encrypted but we have no key — treat as unverifiable
                : block.data;
          if (plaintext === null || sha256(plaintext) !== hash) {
            if (!seen.has(hash)) {
              corrupt.push(hash);
              seen.add(hash);
            }
            objectOk = false;
          } else {
            if (!seen.has(hash)) {
              verified++;
              seen.add(hash);
            }
            parts.push(plaintext);
          }
        } catch {
          // GCM auth failure or similar — count as corrupt.
          if (!seen.has(hash)) {
            corrupt.push(hash);
            seen.add(hash);
          }
          objectOk = false;
        }
      }
      if (objectOk && parts.length === obj.blockHashes.length) {
        const reassembled = Buffer.concat(parts);
        if (sha256(reassembled) !== obj.checksum) {
          // Assembled bytes don't match the recorded object checksum.
          for (const h of obj.blockHashes) {
            if (!corrupt.includes(h) && !missing.includes(h)) corrupt.push(h);
          }
        }
      }
    }

    const manifestTampered = this._manifestChecksum(rp) !== rp.manifestChecksum;

    return {
      restorePointId: rp.id,
      ok: missing.length === 0 && corrupt.length === 0 && !manifestTampered,
      verifiedBlocks: verified,
      missingBlocks: missing,
      corruptBlocks: corrupt,
      manifestTampered,
    };
  }

  /** Recompute the manifest checksum the same way the executor does. */
  private _manifestChecksum(rp: RestorePoint): string {
    const canonical = rp.objects
      .map((o) => `${o.name}:${o.size}:${o.checksum}:${o.blockHashes.join(',')}`)
      .sort()
      .join('|');
    return sha256(Buffer.from(canonical, 'utf8'));
  }
}
