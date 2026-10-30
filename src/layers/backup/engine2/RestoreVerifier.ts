/**
 * Restore Verification Engine
 *
 * Proves a backup actually restores: mounts the restore point into a
 * scratch area, recomputes each object's checksum, and diffs against
 * the manifest recorded at backup time. What you can't restore, you
 * don't have — this engine is the "did it work?" half of the 3-2-1 rule.
 *
 * The scratch area is an in-memory object store supplied by the caller
 * (real deployments hand it a tmpfs/S3 prefix); verification never
 * touches the live namespace.
 *
 * @module BackupLayer/Engine2
 */

import { sha256 } from '../engines/types';
import type { RestorePoint } from '../engines/types';
import type { BackupCatalogEngine } from '../engines/BackupCatalogEngine';
import type { BlockStorageEngine } from '../engines/BlockStorageEngine';

/** Minimal key-value store for scratch-space restores. */
export interface ScratchStore {
  put(key: string, data: Buffer): void;
  get(key: string): Buffer | undefined;
  delete(key: string): boolean;
  keys(): readonly string[];
}

export class InMemoryScratchStore implements ScratchStore {
  private readonly _m = new Map<string, Buffer>();
  put(key: string, data: Buffer): void {
    this._m.set(key, Buffer.from(data));
  }
  get(key: string): Buffer | undefined {
    return this._m.get(key);
  }
  delete(key: string): boolean {
    return this._m.delete(key);
  }
  keys(): readonly string[] {
    return [...this._m.keys()];
  }
}

export type ObjectDiff =
  | { objectName: string; kind: 'verified'; blocks: number; bytes: number }
  | { objectName: string; kind: 'checksum-mismatch'; expected: string; actual: string }
  | { objectName: string; kind: 'missing-blocks'; missing: readonly string[] }
  | { objectName: string; kind: 'missing-restore' };

export interface VerifyReport {
  readonly restorePointId: string;
  readonly verified: number;
  readonly failed: number;
  readonly diffs: readonly ObjectDiff[];
  readonly ok: boolean;
  readonly startedAt: number;
  readonly durationMs: number;
}

export interface RestoreVerifierOptions {
  readonly clock?: { now(): number };
}

/**
 * Reconstructs objects block-by-block from the block store into the
 * scratch area, hashing each restored object and comparing with the
 * manifest checksum.
 */
export class RestoreVerifier {
  private readonly _catalog: BackupCatalogEngine;
  private readonly _blocks: BlockStorageEngine;
  private readonly _clock: { now(): number };

  constructor(
    catalog: BackupCatalogEngine,
    blocks: BlockStorageEngine,
    opts?: RestoreVerifierOptions
  ) {
    this._catalog = catalog;
    this._blocks = blocks;
    this._clock = opts?.clock ?? { now: () => Date.now() };
  }

  /**
   * Restore `restorePointId` into `scratch` and verify every object.
   * Scratch is left populated on success for inspection; callers may
   * wipe it afterwards.
   */
  verifyRestore(restorePointId: string, scratch: ScratchStore): VerifyReport {
    const started = this._clock.now();
    const point = this._catalog.get(restorePointId);
    if (!point) {
      throw new Error(`restore point ${restorePointId} not in catalog`);
    }

    const diffs: ObjectDiff[] = [];
    let verified = 0;

    for (const manifest of point.objects) {
      const missing: string[] = [];
      const parts: Buffer[] = [];
      for (const hash of manifest.blockHashes) {
        const block = this._blocks.get(hash);
        if (block === null) missing.push(hash);
        else parts.push(block.data);
      }
      if (missing.length > 0) {
        diffs.push({ objectName: manifest.name, kind: 'missing-blocks', missing });
        continue;
      }
      const data = Buffer.concat(parts);
      scratch.put(`restore:${manifest.name}`, data);
      const actual = sha256(data);
      if (actual !== manifest.checksum) {
        diffs.push({ objectName: manifest.name, kind: 'checksum-mismatch', expected: manifest.checksum, actual });
        continue;
      }
      verified++;
      diffs.push({ objectName: manifest.name, kind: 'verified', blocks: parts.length, bytes: data.length });
    }

    const failed = diffs.length - verified;
    return {
      restorePointId,
      verified,
      failed,
      diffs,
      ok: failed === 0,
      startedAt: started,
      durationMs: this._clock.now() - started,
    };
  }

  /**
   * Diff a verified scratch restore against expected contents —
   * byte-level comparison for object-level evidence.
   */
  diffObject(scratch: ScratchStore, objectName: string, expected: Buffer): string[] {
    const actual = scratch.get(`restore:${objectName}`);
    const issues: string[] = [];
    if (actual === undefined) {
      issues.push(`restore:${objectName} not present in scratch`);
      return issues;
    }
    if (!actual.equals(expected)) {
      issues.push(
        `restore:${objectName} content differs: expected sha256=${sha256(expected)} got ${sha256(actual)}`
      );
    }
    return issues;
  }
}
