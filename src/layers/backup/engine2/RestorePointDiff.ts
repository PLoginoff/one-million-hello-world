/**
 * Restore-Point Diff Engine
 *
 * Compares two restore points object-by-object and reports what was
 * added, removed, changed, or left identical between backups — the
 * "why did nightly grow by 40 GiB?" tool. Diff is manifest-level
 * (checksums), then drills to block level for changed objects so an
 * operator sees *which* blocks churned.
 *
 * Complexity: O(A + B) via map joins over object names and block hashes.
 *
 * @module BackupLayer/Engine2
 */

import type { ObjectManifest, RestorePoint } from '../engines/types';

export interface ObjectDiffEntry {
  readonly name: string;
  readonly status: 'added' | 'removed' | 'changed' | 'unchanged';
  readonly sizeBefore: number;
  readonly sizeAfter: number;
  /** For changed objects: how many block hashes differ. */
  readonly blocksChanged?: number;
  readonly blocksShared?: number;
  readonly blocksAdded?: readonly string[];
  readonly blocksRemoved?: readonly string[];
}

export interface RestorePointDiff {
  readonly fromId: string;
  readonly toId: string;
  readonly added: readonly ObjectDiffEntry[];
  readonly removed: readonly ObjectDiffEntry[];
  readonly changed: readonly ObjectDiffEntry[];
  readonly unchangedCount: number;
  /** Net new unique blocks introduced by `to` (dedup-visible growth). */
  readonly newBlockCount: number;
  readonly deltaBytes: number;
}

export class RestorePointDiffEngine {
  /**
   * Diff `from` → `to`. Manifests with equal checksums are `unchanged`;
   * everything else drills into block-level hash sets.
   */
  diff(from: RestorePoint, to: RestorePoint): RestorePointDiff {
    const before = new Map(from.objects.map((o) => [o.name, o]));
    const after = new Map(to.objects.map((o) => [o.name, o]));

    const added: ObjectDiffEntry[] = [];
    const removed: ObjectDiffEntry[] = [];
    const changed: ObjectDiffEntry[] = [];
    let unchangedCount = 0;

    for (const [name, a] of after) {
      const b = before.get(name);
      if (b === undefined) {
        added.push({
          name,
          status: 'added',
          sizeBefore: 0,
          sizeAfter: a.size,
          blocksChanged: a.blockHashes.length,
          blocksShared: 0,
          blocksAdded: a.blockHashes,
        });
      } else if (b.checksum !== a.checksum) {
        changed.push(this.blockDiff(b, a));
      } else {
        unchangedCount++;
      }
    }
    for (const [name, b] of before) {
      if (!after.has(name)) {
        removed.push({
          name,
          status: 'removed',
          sizeBefore: b.size,
          sizeAfter: 0,
          blocksChanged: b.blockHashes.length,
          blocksShared: 0,
          blocksRemoved: b.blockHashes,
        });
      }
    }

    const beforeBlocks = new Set(from.objects.flatMap((o) => o.blockHashes));
    const newBlocks = to.objects
      .flatMap((o) => o.blockHashes)
      .filter((h) => !beforeBlocks.has(h));
    const deltaBytes =
      to.objects.reduce((s, o) => s + o.size, 0) - from.objects.reduce((s, o) => s + o.size, 0);

    return {
      fromId: from.id,
      toId: to.id,
      added,
      removed,
      changed,
      unchangedCount,
      newBlockCount: new Set(newBlocks).size,
      deltaBytes,
    };
  }

  /** Block-level diff for a changed object. */
  private blockDiff(b: ObjectManifest, a: ObjectManifest): ObjectDiffEntry {
    const bSet = new Set(b.blockHashes);
    const aSet = new Set(a.blockHashes);
    const addedBlocks = a.blockHashes.filter((h) => !bSet.has(h));
    const removedBlocks = b.blockHashes.filter((h) => !aSet.has(h));
    const shared = a.blockHashes.filter((h) => bSet.has(h)).length;
    return {
      name: a.name,
      status: 'changed',
      sizeBefore: b.size,
      sizeAfter: a.size,
      blocksChanged: addedBlocks.length,
      blocksShared: shared,
      blocksAdded: addedBlocks,
      blocksRemoved: removedBlocks,
    };
  }

  /**
   * Human-readable diff — "what changed" in one paragraph per object.
   */
  renderText(d: RestorePointDiff): string {
    const lines = [
      `RESTORE-POINT DIFF ${d.fromId} → ${d.toId}`,
      `  +${d.added.length} added, -${d.removed.length} removed, ~${d.changed.length} changed, =${d.unchangedCount} unchanged`,
      `  new blocks: ${d.newBlockCount}, net bytes: ${d.deltaBytes}`,
    ];
    for (const o of [...d.added, ...d.removed, ...d.changed]) {
      lines.push(
        `  [${o.status.padEnd(9)}] ${o.name}  ${o.sizeBefore} → ${o.sizeAfter} B` +
          (o.blocksChanged !== undefined ? `  (${o.blocksChanged} blocks churned)` : '')
      );
    }
    return lines.join('\n');
  }
}
