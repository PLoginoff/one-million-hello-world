/**
 * Hive-style Partitioned Paths & Small-File Compaction
 *
 * HivePartitioning
 * ----------------
 * Paths of the form `table/dt=2024-01-01/country=us/part-0000.bin` encode
 * partition column values in the directory names. This module parses,
 * builds, and prunes on those paths:
 *
 *   - `buildPath`/`parsePath` — lossless round-trip with URL-encoding.
 *   - `partitionFilter` — predicate over partition key/values.
 *   - `prune` — given candidate paths and a predicate, returns only paths
 *     whose partition values can match (partition elimination — the
 *     cheapest pruning there is, since it needs zero file bytes).
 *
 * Compactor
 * ---------
 * Merges many small data files within a partition into larger ones:
 * files below `targetSizeBytes` are coalesced greedily (first-fit
 * bin-packing — O(n log n) after sort) and rewritten as a single file,
 * committed via the transaction log as remove-old + add-new.
 *
 * @module DataLake/Engine
 */

import { LakeObjectStore, LakeObject } from './ZoneManager';
import { DeltaTable, LogAction } from './TransactionLog';

/* ------------------------------------------------------------------------ */
/* Hive path encoding                                                       */
/* ------------------------------------------------------------------------ */

/** Parse `a=1/b=2/file` into { partitions: {a:'1',b:'2'}, fileName }. */
export function parsePath(path: string): { partitions: Record<string, string>; fileName: string; dirs: string[] } {
  const parts = path.split('/').filter((p) => p.length > 0);
  const partitions: Record<string, string> = {};
  const dirs: string[] = [];
  let fileName = '';
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    const eq = seg.indexOf('=');
    if (i === parts.length - 1 && eq < 0) {
      fileName = seg;
      continue;
    }
    if (eq > 0) {
      partitions[decodeURIComponent(seg.slice(0, eq))] = decodeURIComponent(seg.slice(eq + 1));
    } else {
      dirs.push(seg);
    }
  }
  return { partitions, fileName, dirs };
}

/** Build `dir1/dir2/k1=v1/k2=v2/fileName` with sorted partition keys. */
export function buildPath(dirs: readonly string[], partitions: Record<string, string>, fileName: string): string {
  const keys = Object.keys(partitions).sort();
  const segs = [...dirs, ...keys.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(partitions[k])}`), fileName];
  return segs.join('/');
}

/** Predicate over a partition map. */
export type PartitionPredicate = (partitions: Record<string, string>) => boolean;

/**
 * Partition elimination over a path list: keeps only paths whose
 * partition key-values satisfy the predicate. O(#paths).
 */
export function prunePaths(paths: readonly string[], predicate: PartitionPredicate): string[] {
  return paths.filter((p) => predicate(parsePath(p).partitions));
}

/** Convenience: compile `column op value` comparisons into a predicate. */
export function partitionPredicate(
  clauses: ReadonlyArray<{ column: string; op: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'in'; value: string | readonly string[] }>
): PartitionPredicate {
  return (parts) =>
    clauses.every((c) => {
      const v = parts[c.column];
      if (v === undefined) {
        // Column not in the partition path: can't disprove → keep.
        return true;
      }
      switch (c.op) {
        case 'eq':
          return v === c.value;
        case 'neq':
          return v !== c.value;
        case 'in':
          return (c.value as readonly string[]).includes(v);
        case 'lt':
          return v < (c.value as string);
        case 'lte':
          return v <= (c.value as string);
        case 'gt':
          return v > (c.value as string);
        case 'gte':
          return v >= (c.value as string);
      }
    });
}

/* ------------------------------------------------------------------------ */
/* Compaction                                                               */
/* ------------------------------------------------------------------------ */

/** One candidate file for compaction. */
export interface CompactionCandidate {
  readonly path: string;
  readonly sizeBytes: number;
}

/** A merge plan: which input files fuse into which output. */
export interface CompactionBin {
  readonly inputs: string[];
  readonly estimatedOutputBytes: number;
}

/** Result of planning (or executing) a compaction pass. */
export interface CompactionPlan {
  readonly bins: CompactionBin[];
  /** Files left untouched (already large enough or singletons). */
  readonly skipped: string[];
  readonly totalInputFiles: number;
  readonly totalOutputFiles: number;
}

/**
 * Small-file compactor.
 *
 * Planning uses first-fit-decreasing bin packing over file sizes — files
 * are sorted desc and each is placed in the first bin with remaining
 * capacity. Real systems (e.g. Delta OPTIMIZE, Iceberg rewrite_data_files)
 * use the same greedy heuristic.
 */
export class Compactor {
  private readonly _targetBytes: number;
  private readonly _minFiles: number;

  constructor(opts: { targetSizeBytes?: number; minFilesToCompact?: number } = {}) {
    this._targetBytes = opts.targetSizeBytes ?? 128 * 1024 * 1024;
    this._minFiles = opts.minFilesToCompact ?? 2;
  }

  /**
   * Compute merge bins for the given files.
   * Files ≥ target size are skipped outright; the rest are FFD-packed.
   */
  plan(files: readonly CompactionCandidate[]): CompactionPlan {
    const small = files.filter((f) => f.sizeBytes < this._targetBytes);
    const skipped = files.filter((f) => f.sizeBytes >= this._targetBytes).map((f) => f.path);
    // FFD: sort desc, first-fit into open bins.
    const sorted = small.slice().sort((a, b) => b.sizeBytes - a.sizeBytes);
    const bins: { inputs: string[]; used: number }[] = [];
    for (const f of sorted) {
      let placed = false;
      for (const bin of bins) {
        if (bin.used + f.sizeBytes <= this._targetBytes) {
          bin.inputs.push(f.path);
          bin.used += f.sizeBytes;
          placed = true;
          break;
        }
      }
      if (!placed) bins.push({ inputs: [f.path], used: f.sizeBytes });
    }
    // Keep only bins with ≥ minFiles members; singleton bins stay un-merged.
    const merged: CompactionBin[] = [];
    for (const b of bins) {
      if (b.inputs.length >= this._minFiles) {
        merged.push({ inputs: b.inputs, estimatedOutputBytes: b.used });
      } else {
        skipped.push(...b.inputs);
      }
    }
    return { bins: merged, skipped, totalInputFiles: files.length, totalOutputFiles: merged.length };
  }

  /**
   * Execute a compaction against a DeltaTable: concatenate input payloads
   * (with a simple length-prefixed framing so boundaries survive) and
   * commit remove-old + add-new atomically in one version.
   */
  execute(table: DeltaTable, store: LakeObjectStore, plan: CompactionPlan): { newFiles: string[] } {
    const newFiles: string[] = [];
    for (const bin of plan.bins) {
      const parts: Uint8Array[] = [];
      let total = 0;
      for (const path of bin.inputs) {
        const obj = store.get(path);
        if (obj === undefined) continue;
        const header = new Uint8Array(4);
        new DataView(header.buffer).setUint32(0, obj.data.byteLength, true);
        parts.push(header, obj.data);
        total += 4 + obj.data.byteLength;
      }
      const merged = new Uint8Array(total);
      let off = 0;
      for (const p of parts) {
        merged.set(p, off);
        off += p.length;
      }
      const first = bin.inputs[0];
      const dir = first.slice(0, first.lastIndexOf('/'));
      const rel = first.slice(this._tableRelPrefix(table).length);
      const name = `compact-${Date.now().toString(36)}-${newFiles.length}.bin`;
      const newPath = `${dir}/${name}`;
      // One commit per bin keeps versions simple; alternatively batch.
      const snap = table.log.snapshot();
      const actions: LogAction[] = bin.inputs.map((p) => ({ type: 'remove', path: p, deletionTimestamp: Date.now() }));
      store.put({
        path: newPath,
        zone: 'curated',
        data: merged,
        contentType: 'application/x-lake-columnar',
        tags: { compacted: 'true' },
        createdAt: Date.now(),
        updatedAt: Date.now(),
        sizeBytes: merged.byteLength,
      });
      actions.push({ type: 'add', path: newPath, sizeBytes: merged.byteLength, partitionValues: {} });
      table.log.commit(snap.version, actions);
      newFiles.push(newPath);
      void rel;
    }
    return { newFiles };
  }

  private _tableRelPrefix(table: DeltaTable): string {
    return `${table.log.tablePath}/`;
  }
}
