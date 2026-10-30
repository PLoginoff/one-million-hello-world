/**
 * Block Storage Engine
 *
 * Content-addressed block store: blocks are keyed by the SHA-256 of
 * their *plaintext* so deduplication works regardless of which backup
 * (or which encryption nonce) produced them. Reference counting tracks
 * how many restore points depend on each block so pruning can free
 * storage safely.
 *
 * This mirrors how restic and Borg work: content-addressed chunks,
 * pack-level reference counts, GC = walk manifests and sweep unreferenced
 * blocks.
 *
 * @module BackupLayer/Engines
 */

import { sha256, StoredBlock } from './types';

export class BlockStorageEngine {
  private readonly _blocks: Map<string, StoredBlock>;
  /** hash → number of restore points referencing the block. */
  private readonly _refCounts: Map<string, number>;
  private _storedBytes: number;

  constructor() {
    this._blocks = new Map();
    this._refCounts = new Map();
    this._storedBytes = 0;
  }

  /**
   * Store a block. If the hash already exists, only the refcount is
   * bumped — deduplication. Returns the hash.
   */
  put(block: StoredBlock): string {
    const hash = block.hash;
    if (!this._blocks.has(hash)) {
      this._blocks.set(hash, block);
      this._refCounts.set(hash, 0);
      this._storedBytes += block.size;
    }
    return hash;
  }

  /**
   * Replace a block's payload in place (e.g. re-encryption during key
   * rotation). Unlike `put`, this overwrites existing content — the
   * caller is responsible for correctness; returns false when absent.
   */
  replace(block: StoredBlock): boolean {
    const existing = this._blocks.get(block.hash);
    if (!existing) return false;
    this._storedBytes += block.size - existing.size;
    this._blocks.set(block.hash, block);
    return true;
  }

  /** Increment the reference count for a block (once per restore point). */
  retain(hash: string): void {
    this._refCounts.set(hash, (this._refCounts.get(hash) ?? 0) + 1);
  }

  /** Decrement the reference count; never below zero. */
  release(hash: string): void {
    const n = this._refCounts.get(hash) ?? 0;
    this._refCounts.set(hash, Math.max(0, n - 1));
  }

  get(hash: string): StoredBlock | null {
    return this._blocks.get(hash) ?? null;
  }

  has(hash: string): boolean {
    return this._blocks.has(hash);
  }

  refCount(hash: string): number {
    return this._refCounts.get(hash) ?? 0;
  }

  /**
   * Delete blocks with refcount 0 (or in `hashes` if given).
   * Returns freed bytes.
   */
  sweep(hashes?: Iterable<string>): number {
    let freed = 0;
    const candidates = hashes ? [...hashes] : [...this._blocks.keys()];
    for (const hash of candidates) {
      if ((this._refCounts.get(hash) ?? 0) > 0) continue;
      const block = this._blocks.get(hash);
      if (!block) continue;
      this._blocks.delete(hash);
      this._refCounts.delete(hash);
      freed += block.size;
    }
    this._storedBytes -= freed;
    return freed;
  }

  /** Raw bytes currently stored (ciphertext counts). */
  storedBytes(): number {
    return this._storedBytes;
  }

  blockCount(): number {
    return this._blocks.size;
  }

  /**
   * Verify a stored block's integrity: for unencrypted blocks the hash is
   * over ciphertext == plaintext; for encrypted blocks the hash is over
   * plaintext so we can only verify presence + structure here — full
   * verification happens post-decrypt in the integrity engine.
   */
  verifyBlock(hash: string): boolean {
    const block = this._blocks.get(hash);
    if (!block) return false;
    if (block.encrypted) {
      // Can't hash plaintext without the key; check structural sanity.
      return block.nonce !== null && block.authTag !== null && block.data.length > 0;
    }
    return sha256(block.data) === hash;
  }
}
