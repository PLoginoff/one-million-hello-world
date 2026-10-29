/**
 * HashTree — Merkle-style integrity verification for snapshot data.
 *
 * A snapshot is divided into fixed-size "blocks" (key ranges or byte
 * chunks). Each block is hashed; pairs of hashes are hashed together to
 * form a binary tree; the root hash is the snapshot's integrity
 * fingerprint. Verifying a single block requires only O(log n) hashes —
 * the classic Merkle proof.
 *
 * Hash function: FNV-1a 64-bit — fast, non-cryptographic, sufficient for
 * in-memory integrity checking. For tamper-resistance you'd swap in
 * SHA-256; the API accepts a pluggable hash function.
 *
 * Layout (bottom-up):
 *   level 0: [h(b0), h(b1), h(b2), h(b3)]   — block hashes
 *   level 1: [h(h(b0)‖h(b1)), h(h(b2)‖h(b3))]
 *   level 2: [root]
 *
 * Odd node counts promote the last node unchanged — standard practice.
 *
 * @module SnapshotLayer/Implementations
 */

// ------------------------------------------------------------------ types

/** Hash function signature — takes bytes (as a hex string), returns hex. */
export type HashFn = (data: string) => string;

/** A snapshot block: id + content + precomputed hash. */
export interface Block {
  readonly blockId: string;
  readonly data: string;
  readonly hash: string;
}

/** Proof that a block belongs to a tree. */
export interface MerkleProof {
  readonly blockIndex: number;
  readonly blockHash: string;
  /** Sibling hashes bottom-up; side tells where the sibling sits. */
  readonly path: Array<{ hash: string; side: 'left' | 'right' }>;
  readonly root: string;
}

// ------------------------------------------------------------------ fnv1a

/**
 * FNV-1a 64-bit hash → hex string. Fast non-crypto hash; collision
 * resistance is adequate for corruption detection (not adversarial
 * tampering).
 */
export function fnv1a64(data: string): string {
  // FNV-1a: hash = 0xcbf29ce484222325; for each byte: hash ^= byte; hash *= 0x100000001b3
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < data.length; i++) {
    h ^= BigInt(data.charCodeAt(i) & 0xff);
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(16, '0');
}

/** Combine two hashes — parent node value. */
export function combineHashes(a: string, b: string, hashFn: HashFn = fnv1a64): string {
  return hashFn(`${a}|${b}`);
}

// ------------------------------------------------------------------ tree

/**
 * Merkle tree over a list of block hashes. Immutable after construction.
 */
export class HashTree {
  /** Leaves upward; `_levels[0]` = block hashes, last level = [root]. */
  private readonly _levels: string[][];
  private readonly _hashFn: HashFn;

  constructor(blockHashes: readonly string[], hashFn: HashFn = fnv1a64) {
    this._hashFn = hashFn;
    if (blockHashes.length === 0) {
      this._levels = [[]];
      return;
    }
    const levels: string[][] = [[...blockHashes]];
    let level = blockHashes;
    while (level.length > 1) {
      const next: string[] = [];
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i]!;
        const right = level[i + 1];
        next.push(right === undefined ? left : combineHashes(left, right, hashFn));
      }
      levels.push(next);
      level = next;
    }
    this._levels = levels;
  }

  /** Root hash — the snapshot fingerprint. Empty tree → ''. */
  get root(): string {
    const top = this._levels[this._levels.length - 1];
    return top && top.length > 0 ? (top[0] ?? '') : '';
  }

  /** Number of leaf blocks. */
  get blockCount(): number {
    return this._levels[0]?.length ?? 0;
  }

  /** Tree height (levels including leaf level). */
  get height(): number {
    return this._levels.length;
  }

  /** Raw level data — for serialization / debugging. */
  get levels(): readonly string[][] {
    return this._levels;
  }

  /**
   * Build a Merkle proof for block at `index`. Verifying the proof
   * requires only O(log n) hashes — the sibling path to the root.
   */
  prove(index: number): MerkleProof {
    const leaves = this._levels[0] ?? [];
    if (index < 0 || index >= leaves.length) {
      throw new Error(`Block index ${index} out of range`);
    }
    const path: Array<{ hash: string; side: 'left' | 'right' }> = [];
    let idx = index;
    for (let lvl = 0; lvl < this._levels.length - 1; lvl++) {
      const level = this._levels[lvl]!;
      const isRight = idx % 2 === 1;
      const siblingIdx = isRight ? idx - 1 : idx + 1;
      const sibling = level[siblingIdx];
      if (sibling !== undefined) {
        path.push({
          hash: sibling,
          side: isRight ? 'left' : 'right',
        });
      }
      idx = Math.floor(idx / 2);
    }
    return {
      blockIndex: index,
      blockHash: leaves[index]!,
      path,
      root: this.root,
    };
  }

  /**
   * Verify a Merkle proof — recompute the path and compare roots.
   * O(log n) hashes, no tree access needed.
   */
  static verify(proof: MerkleProof, hashFn: HashFn = fnv1a64): boolean {
    let current = proof.blockHash;
    for (const step of proof.path) {
      current =
        step.side === 'left'
          ? combineHashes(step.hash, current, hashFn)
          : combineHashes(current, step.hash, hashFn);
    }
    return current === proof.root;
  }

  /**
   * Locate the first differing block between this tree and another.
   * Compares top-down: if roots match, trees are identical. Otherwise,
   * walk down to find divergent leaves — O(log n) hashes compared.
   *
   * @returns first differing leaf index, or -1 if identical
   */
  firstDivergence(other: HashTree): number {
    if (this.root === other.root) return -1;
    const a = this._levels;
    const b = other._levels;
    // Walk down level by level comparing nodes.
    let lvl = Math.min(a.length, b.length) - 1;
    let idx = 0;
    while (lvl > 0) {
      const aLevel = a[lvl]!;
      const bLevel = b[lvl]!;
      // Find the first index in this level that differs — that's where
      // we descend. If none differ at this level the difference is in
      // a subtree we haven't reached yet.
      let found = -1;
      const n = Math.max(aLevel.length, bLevel.length);
      for (let i = idx; i < n; i++) {
        const av = aLevel[i];
        const bv = bLevel[i];
        if (av !== bv) {
          found = i;
          break;
        }
      }
      if (found < 0) break;
      idx = found * 2;
      lvl -= 1;
    }
    // At leaf level, return the first differing index.
    const leaves = a[0]!;
    const otherLeaves = b[0]!;
    const n = Math.max(leaves.length, otherLeaves.length);
    for (let i = 0; i < n; i++) {
      if (leaves[i] !== otherLeaves[i]) return i;
    }
    return -1;
  }
}

/** Hash a string block — helper for building leaf hashes. */
export function hashBlock(blockId: string, data: string, hashFn: HashFn = fnv1a64): string {
  return hashFn(`${blockId}:${data}`);
}
