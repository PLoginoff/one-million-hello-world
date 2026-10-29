/**
 * Backup Executor Engine
 *
 * Runs full and incremental backups of a source snapshot.
 *
 * Changed-block detection: every object is split into fixed-size blocks
 * and each block is content-addressed by SHA-256. A block already in the
 * store (from ANY prior backup) is not re-written — this is the same
 * dedup mechanism restic uses. An incremental restore point records the
 * FULL manifest of every object at snapshot time (not just deltas) but
 * only stores blocks that are new; its `parentId` links it to the chain
 * so restores and pruning understand dependencies.
 *
 * Incrementals are therefore "synthetic fulls": any restore point is
 * independently restorable, but block-level dedup means the cost is
 * proportional to changed data.
 *
 * @module BackupLayer/Engines
 */

import {
  BackupKind,
  BackupPolicy,
  IClock,
  ObjectManifest,
  RestorePoint,
  sha256,
  SourceSnapshot,
  SystemClock,
} from './types';
import { BlockStorageEngine } from './BlockStorageEngine';
import { BackupEncryptionEngine } from './BackupEncryptionEngine';

let rpSeq = 0;

export class BackupExecutorEngine {
  private readonly _storage: BlockStorageEngine;
  private readonly _encryption: BackupEncryptionEngine | null;
  private readonly _blockSize: number;
  private readonly _clock: IClock;
  /** sourceId → latest restore point id (incremental chain head). */
  private readonly _chainHeads: Map<string, string>;
  private readonly _restorePoints: Map<string, RestorePoint>;

  constructor(
    storage: BlockStorageEngine,
    options: {
      blockSize?: number;
      encryption?: BackupEncryptionEngine | null;
      clock?: IClock;
    } = {}
  ) {
    this._storage = storage;
    this._encryption = options.encryption ?? null;
    this._blockSize = options.blockSize ?? 4096;
    this._clock = options.clock ?? new SystemClock();
    this._chainHeads = new Map();
    this._restorePoints = new Map();
  }

  /**
   * Run a backup of `snapshot` under `policy`.
   *
   * @param kind FULL captures all objects; INCREMENTAL links to the
   *    chain head so restore planning knows the dependency. Both store
   *    only blocks not already present (dedup), but an incremental with
   *    no parent behaves exactly like a full for restore purposes.
   */
  runBackup(
    policy: BackupPolicy,
    sourceId: string,
    snapshot: SourceSnapshot,
    kind: BackupKind
  ): RestorePoint {
    if (!policy.scope.includes(sourceId)) {
      throw new Error(`Source '${sourceId}' is not in scope of policy '${policy.id}'`);
    }
    const encrypt = policy.requireEncryption || this._encryption !== null;
    if (policy.requireEncryption && !this._encryption) {
      throw new Error(`Policy '${policy.id}' requires encryption but no key was provided`);
    }

    const parentId = kind === BackupKind.Incremental ? (this._chainHeads.get(sourceId) ?? null) : null;

    const objects: ObjectManifest[] = [];
    const newBlockHashes: string[] = [];

    for (const [name, content] of snapshot) {
      const blockHashes: string[] = [];
      for (let offset = 0; offset < content.length; offset += this._blockSize) {
        const chunk = content.subarray(offset, Math.min(offset + this._blockSize, content.length));
        const hash = sha256(chunk);
        blockHashes.push(hash);

        if (!this._storage.has(hash)) {
          if (encrypt && this._encryption) {
            const payload = this._encryption.encrypt(chunk);
            this._storage.put({
              hash, // hash of plaintext — dedup still works under encryption
              data: payload.ciphertext,
              size: payload.ciphertext.length,
              encrypted: true,
              nonce: payload.nonce,
              authTag: payload.authTag,
            });
          } else {
            this._storage.put({
              hash,
              data: Buffer.from(chunk),
              size: chunk.length,
              encrypted: false,
              nonce: null,
              authTag: null,
            });
          }
          newBlockHashes.push(hash);
        }
        this._storage.retain(hash);
      }
      objects.push({
        name,
        blockHashes,
        size: content.length,
        checksum: sha256(content),
      });
    }

    rpSeq += 1;
    const rp: RestorePoint = {
      id: `rp-${rpSeq.toString(36)}-${this._clock.now().toString(36)}`,
      policyId: policy.id,
      sourceId,
      kind,
      createdAt: this._clock.now(),
      parentId,
      objects,
      newBlockHashes,
      manifestChecksum: this._manifestChecksum(objects),
      encrypted: encrypt,
      pinned: false,
    };

    this._restorePoints.set(rp.id, rp);
    this._chainHeads.set(sourceId, rp.id);
    return rp;
  }

  /**
   * Reconstruct an object's plaintext at a restore point.
   * Decrypts blocks when needed; verifies each block's hash before
   * assembly so corrupt data can never be returned.
   */
  restoreObject(restorePointId: string, objectName: string): Buffer {
    const rp = this._requireRp(restorePointId);
    const manifest = rp.objects.find((o) => o.name === objectName);
    if (!manifest) {
      throw new Error(`Object '${objectName}' not in restore point ${restorePointId}`);
    }
    const parts: Buffer[] = [];
    for (const hash of manifest.blockHashes) {
      const block = this._storage.get(hash);
      if (!block) {
        throw new Error(`Missing block ${hash} — backup is corrupt or was pruned`);
      }
      const plaintext =
        block.encrypted && this._encryption
          ? this._encryption.decrypt({ ciphertext: block.data, nonce: block.nonce!, authTag: block.authTag! })
          : block.data;
      if (sha256(plaintext) !== hash) {
        throw new Error(`Block ${hash} failed integrity check during restore`);
      }
      parts.push(plaintext);
    }
    const result = Buffer.concat(parts);
    if (sha256(result) !== manifest.checksum) {
      throw new Error(`Object '${objectName}' checksum mismatch after reassembly`);
    }
    return result;
  }

  getRestorePoint(id: string): RestorePoint | null {
    return this._restorePoints.get(id) ?? null;
  }

  allRestorePoints(): RestorePoint[] {
    return [...this._restorePoints.values()];
  }

  chainHead(sourceId: string): string | null {
    return this._chainHeads.get(sourceId) ?? null;
  }

  /**
   * Remove a restore point from the catalog and release its block
   * references. The caller (pruning engine) is responsible for ordering —
   * removing a parent while children still need its blocks corrupts the
   * chain; see {@link RetentionPruningEngine}.
   */
  removeRestorePoint(id: string): boolean {
    const rp = this._restorePoints.get(id);
    if (!rp) return false;
    for (const obj of rp.objects) {
      for (const hash of obj.blockHashes) {
        this._storage.release(hash);
      }
    }
    this._restorePoints.delete(id);
    if (this._chainHeads.get(rp.sourceId) === id) {
      // Re-point head at parent, or clear if none.
      if (rp.parentId && this._restorePoints.has(rp.parentId)) {
        this._chainHeads.set(rp.sourceId, rp.parentId);
      } else {
        this._chainHeads.delete(rp.sourceId);
      }
    }
    // Orphaned children lose their parent link — they remain restorable
    // (synthetic full) but the chain shrinks.
    for (const other of this._restorePoints.values()) {
      if (other.parentId === id) other.parentId = null;
    }
    return true;
  }

  /** Split a buffer into blockSize chunks — exposed for tests. */
  splitBlocks(content: Buffer): Buffer[] {
    const out: Buffer[] = [];
    for (let o = 0; o < content.length; o += this._blockSize) {
      out.push(content.subarray(o, Math.min(o + this._blockSize, content.length)));
    }
    return out;
  }

  /** SHA-256 over the canonical manifest serialization. */
  private _manifestChecksum(objects: ObjectManifest[]): string {
    const canonical = objects
      .map((o) => `${o.name}:${o.size}:${o.checksum}:${o.blockHashes.join(',')}`)
      .sort()
      .join('|');
    return sha256(Buffer.from(canonical, 'utf8'));
  }

  private _requireRp(id: string): RestorePoint {
    const rp = this._restorePoints.get(id);
    if (!rp) throw new Error(`Unknown restore point: ${id}`);
    return rp;
  }
}
