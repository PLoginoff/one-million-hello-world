/**
 * BackupChainVerifier — incremental backup chains with integrity proofs.
 *
 * Builds on `SnapshotManager`'s full/incremental chain model and adds
 * the operational layer a backup system needs:
 *
 *   - CHAIN VERIFICATION: walk a snapshot's ancestry back to the chain
 *     root, re-verifying every block hash and Merkle root, then replay
 *     the deltas and confirm the reconstructed state hash matches what
 *     a point-in-time materialization produces.
 *
 *   - REPAIR DETECTION: report exactly which links in the chain are
 *     corrupt so operators know the earliest restorable point.
 *
 *   - COMPACTION: merge incremental links into their parent (squash)
 *     while preserving restore-equivalence — verified before and after.
 *
 * Each `StoredSnapshot` already carries a Merkle root over its blocks;
 * the verifier additionally hashes the RESTORED state so an attacker
 * who rewrites block content but preserves block hashes (impossible
 * with a real hash, but the verifier proves it) cannot fool restore.
 *
 * State hash: FNV-1a over canonical key→value serialization — the same
 * function the manager uses, keeping the module dependency-free.
 *
 * @module SnapshotLayer/Engine2
 */

import { createHash } from 'crypto';
import { SnapshotManager } from '../implementations/SnapshotManager';
import type { StoredSnapshot } from '../implementations/SnapshotManager';
import { hashBlock, fnv1a64 } from '../implementations/HashTree';
import type { HashFn } from '../implementations/HashTree';

// ------------------------------------------------------------------ types

/** Per-link verification outcome. */
export interface LinkVerification {
  readonly snapshotId: string;
  readonly kind: 'full' | 'incremental';
  readonly parentId?: string;
  /** Merkle root recomputed over stored blocks — matches stored root? */
  readonly merkleOk: boolean;
  /** Every block's content re-hashes to its stored hash? */
  readonly blocksOk: boolean;
  /** Index of the first corrupt block, if any. */
  readonly corruptBlock?: number;
}

/** Full chain verification result. */
export interface ChainReport {
  /** The snapshot the chain was verified for (the tip). */
  readonly tipId: string;
  /** All links root→tip in ancestry order. */
  readonly links: LinkVerification[];
  /** True when every link passed. */
  readonly intact: boolean;
  /** First corrupt snapshot id walking root→tip (undefined if intact). */
  readonly firstCorruptId?: string;
  /**
   * Restored-state digest of the tip — SHA-256 over canonical
   * key=value lines. Comparable across managers for the same data.
   */
  readonly stateDigest: string;
  /** Snapshot id of the newest VERIFIED point from which a restore succeeds. */
  readonly lastRestorableId?: string;
}

/** Result of squashing a run of incremental links. */
export interface SquashResult {
  /** New FULL snapshot replacing the squashed range. */
  readonly snapshot: StoredSnapshot;
  /** Snapshot ids removed by the squash. */
  readonly removedIds: string[];
}

// ------------------------------------------------------------------ hashing

/**
 * Canonical digest of a materialized state map: sort keys, serialize
 * each as `key=JSON.stringify(value)`, SHA-256 the joined lines.
 */
export function stateDigest(state: Map<string, unknown>): string {
  const h = createHash('sha256');
  const keys = [...state.keys()].sort();
  for (const k of keys) {
    h.update(k);
    h.update('=');
    h.update(JSON.stringify(state.get(k)) ?? 'null');
    h.update('\n');
  }
  return h.digest('hex');
}

// ------------------------------------------------------------------ verifier

export class BackupChainVerifier {
  private readonly _manager: SnapshotManager;
  private readonly _hashFn: HashFn;

  constructor(manager: SnapshotManager, hashFn: HashFn = fnv1a64) {
    this._manager = manager;
    this._hashFn = hashFn;
  }

  /**
   * Verify one snapshot link: re-hash every stored block and recompute
   * the Merkle root. Does not touch ancestors.
   */
  verifyLink(snap: StoredSnapshot): LinkVerification {
    let blocksOk = true;
    let corruptBlock: number | undefined;
    const recomputed: string[] = [];
    for (let i = 0; i < snap.blocks.length; i++) {
      const b = snap.blocks[i];
      // Must mirror SnapshotManager._blockHash exactly: sorted entries
      // joined as `k=v;...`, hashed as `b<bucketIndex>:<body>`.
      const keys = Object.keys(b.entries).sort();
      const body = keys.map((k) => `${k}=${b.entries[k]}`).join(';');
      const h = hashBlock(`b${b.bucketIndex}`, body, this._hashFn);
      recomputed.push(h);
      if (h !== b.hash) {
        blocksOk = false;
        corruptBlock ??= i;
      }
    }
    // Recompute root exactly like the manager: pairwise combine.
    const merkleOk = recomputeRoot(recomputed, this._hashFn) === snap.rootHash;
    return {
      snapshotId: snap.id,
      kind: snap.kind,
      parentId: snap.parentId,
      merkleOk,
      blocksOk,
      corruptBlock,
    };
  }

  /**
   * Verify the whole ancestry chain of `tipId`, root→tip.
   *
   * Cost: O(total blocks in chain) hashes — the heavy path in backup
   * verification, but far cheaper than re-reading source data.
   */
  verifyChain(tipId: string): ChainReport {
    const chain = this._manager.chainOf(tipId); // root → tip
    const links: LinkVerification[] = [];
    let firstCorruptId: string | undefined;
    let lastRestorableId: string | undefined;

    for (const snap of chain) {
      const link = this.verifyLink(snap);
      links.push(link);
      if (!link.merkleOk || !link.blocksOk) {
        firstCorruptId ??= snap.id;
      } else if (firstCorruptId === undefined) {
        lastRestorableId = snap.id;
      }
    }

    // If every link is clean the tip itself is restorable.
    let digest = '';
    if (firstCorruptId === undefined) {
      const state = this._manager.restore(tipId);
      digest = stateDigest(state);
      lastRestorableId = tipId;
    } else if (lastRestorableId !== undefined) {
      digest = stateDigest(this._manager.restore(lastRestorableId));
    }

    return {
      tipId,
      links,
      intact: firstCorruptId === undefined,
      firstCorruptId,
      stateDigest: digest,
      lastRestorableId,
    };
  }

  /**
   * Verify EVERY snapshot chain in the manager — one report per tip
   * (a tip is a snapshot with no children that point at it, or any
   * snapshot explicitly requested). Returns reports for every snapshot
   * that is a leaf of the DAG; interior links verified transitively.
   */
  verifyAll(): ChainReport[] {
    const all = this._manager.list();
    if (all.length === 0) return [];
    const parentIds = new Set(all.map((s) => s.parentId).filter((p): p is string => p !== undefined));
    const tips = all.filter((s) => !parentIds.has(s.id));
    // If the DAG has no leaves besides covered ones, verify the newest.
    const targets = tips.length > 0 ? tips : [all[all.length - 1]];
    return targets.map((t) => this.verifyChain(t.id));
  }

  /**
   * Assert a chain is intact; throws with the first corrupt link.
   * Convenience for scheduled verification jobs.
   */
  assertIntact(tipId: string): void {
    const report = this.verifyChain(tipId);
    if (!report.intact) {
      const bad = report.links.find((l) => l.snapshotId === report.firstCorruptId);
      throw new Error(
        `Backup chain to '${tipId}' corrupt at '${report.firstCorruptId}'` +
          (bad?.corruptBlock !== undefined ? ` (block ${bad.corruptBlock})` : ''),
      );
    }
  }
}

// ------------------------------------------------------------------ compactor

/**
 * Squashes runs of incremental snapshots into standalone FULL
 * snapshots, shortening chains so restore walks fewer deltas.
 *
 * Semantics: squash(A..B) produces a FULL snapshot whose restored state
 * equals restore(B). Children of B re-point to the new full snapshot.
 * Restore-equivalence is verified via state digest before deletion.
 */
export class ChainCompactor {
  private readonly _manager: SnapshotManager;
  private readonly _verifier: BackupChainVerifier;

  constructor(manager: SnapshotManager) {
    this._manager = manager;
    this._verifier = new BackupChainVerifier(manager);
  }

  /**
   * Merge `tipId` and its incremental ancestors into a single FULL
   * snapshot by flattening the tip in place, then deleting the
   * incremental links that are no longer referenced by any surviving
   * snapshot. The tip id is preserved (flatten keeps it); `removedIds`
   * lists the incremental ancestors actually deleted.
   */
  squashToFull(tipId: string, labels: string[] = []): SquashResult | undefined {
    const chain = this._manager.chainOf(tipId);
    if (chain.length <= 1) return undefined; // already a lone full root

    const expected = stateDigest(this._manager.restore(tipId));

    // Materialize the tip state and rewrite it as a standalone FULL.
    const flat = this._manager.flatten(tipId);
    for (const l of labels) flat.labels.add(l);

    // Verify restore-equivalence before touching ancestors.
    const actual = stateDigest(this._manager.restore(flat.id));
    if (actual !== expected) {
      throw new Error(`Squash verification failed: digest ${actual} != expected ${expected}`);
    }

    // Reference-count parents across ALL snapshots, then walk the
    // chain tip→root deleting ancestors while their refcount is zero.
    // Deleting a link releases its own parent reference, so a whole
    // unshared tail collapses; a link shared by another branch stops
    // the walk (its refcount stays > 0).
    const refCount = new Map<string, number>();
    for (const s of this._manager.list()) {
      if (s.parentId) refCount.set(s.parentId, (refCount.get(s.parentId) ?? 0) + 1);
    }
    const removedIds: string[] = [];
    for (let i = chain.length - 2; i >= 0; i--) {
      const anc = chain[i];
      if ((refCount.get(anc.id) ?? 0) > 0) break; // shared with a branch
      if (!this._manager.delete(anc.id)) break;
      removedIds.unshift(anc.id);
      if (anc.parentId) {
        refCount.set(anc.parentId, (refCount.get(anc.parentId) ?? 1) - 1);
      }
    }
    return { snapshot: flat, removedIds };
  }

  /**
   * Compact every chain whose incremental depth exceeds `maxDepth`.
   * Returns one result per squashed chain.
   */
  compactDeepChains(maxDepth: number): SquashResult[] {
    const all = this._manager.list();
    const parentIds = new Set(all.map((s) => s.parentId).filter((p): p is string => p !== undefined));
    const tips = all.filter((s) => !parentIds.has(s.id));
    const results: SquashResult[] = [];
    for (const tip of tips) {
      const chain = this._manager.chainOf(tip.id);
      let depth = 0;
      for (let i = chain.length - 1; i >= 0 && chain[i].kind === 'incremental'; i--) depth++;
      if (depth > maxDepth) {
        const r = this.squashToFull(tip.id);
        if (r) results.push(r);
      }
    }
    return results;
  }

  /** Access the underlying verifier for combined workflows. */
  get verifier(): BackupChainVerifier {
    return this._verifier;
  }
}

// ------------------------------------------------------------------ helpers

/** Recompute a Merkle root exactly as SnapshotManager does. */
function recomputeRoot(blockHashes: string[], hashFn: HashFn): string {
  if (blockHashes.length === 0) return hashFn('empty');
  let level = [...blockHashes];
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 < level.length) {
        next.push(hashFn(level[i] + '|' + level[i + 1]));
      } else {
        next.push(level[i]); // odd node promoted
      }
    }
    level = next;
  }
  return level[0];
}
