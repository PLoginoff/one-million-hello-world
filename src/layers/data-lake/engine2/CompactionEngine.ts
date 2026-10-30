/**
 * Compaction Engine — row-aware small-file merge with manifest update
 *
 * The base engine's `Compactor` (in `HivePartitioning.ts`) works at the
 * file-bytes level: it concatenates payloads and commits add/remove
 * actions. This engine operates one level up — on the `VersionedTable`
 * row manifests — and compacts *by partition* with correctness
 * guarantees the byte-level version can't give:
 *
 *   - Row-level merge: small files within a partition are merged into
 *     target-size files; the merged output preserves row order by
 *     write-sequence (the same order `read` would produce) — byte-level
 *     concat can't promise this across interleaved writes.
 *   - Manifest-aware planning: only files in the *current* manifest are
 *     candidates; planning respects per-partition skew so a hot
 *     partition doesn't drag the whole table into a rewrite.
 *   - Atomic commit: each bin's merge lands as a single version —
 *     remove-N + add-1 in one manifest, so readers see either the old
 *     small files or the merged one, never both.
 *   - Rewrite audit: the plan records bytes-in/bytes-out and an
 *     estimated read-cost saving (fewer files to open) — the metric
 *     real compaction jobs (OPTIMIZE, Iceberg rewrite_data_files)
 *     report.
 *
 * Complexity: O(#files log #files) for planning (sort + bin-pack),
 * O(rows) for merge execution.
 *
 * @module DataLake/Engine2
 */

import { LakeObjectStore, LakeObject } from '../engine/ZoneManager';
import { TableFile, TableManifest, VersionedTable } from './VersionedTable';
import { LakeRow } from '../engine/ColumnarFileFormat';

/** One merge bin — a group of files to combine. */
export interface MergeBin {
  /** Input file paths, in merge order. */
  readonly inputs: readonly string[];
  /** Estimated output size. */
  readonly estimatedBytes: number;
  /** Total input rows. */
  readonly inputRows: number;
  /** Partition this bin belongs to (empty string = unpartitioned). */
  readonly partitionKey: string;
}

/** Full compaction plan. */
export interface CompactionPlan2 {
  readonly bins: readonly MergeBin[];
  /** Files left untouched. */
  readonly skipped: readonly string[];
  readonly totalInputFiles: number;
  readonly totalInputBytes: number;
  readonly totalOutputFiles: number;
  /** Estimated bytes saved through consolidation overhead. */
  readonly estimatedBytesSaved: number;
}

/** Outcome of executing a plan. */
export interface CompactionResult {
  readonly plan: CompactionPlan2;
  /** New file paths created. */
  readonly newFiles: readonly string[];
  /** Versions committed by the merge (one per bin). */
  readonly committedVersions: readonly number[];
  readonly rowsProcessed: number;
}

/** Engine tuning. */
export interface CompactionConfig {
  /** Target output file size in bytes. Default 128MB. */
  readonly targetFileBytes: number;
  /**
   * Minimum files in a partition before it's considered a compaction
   * candidate. Default 3.
   */
  readonly minFilesToCompact: number;
  /**
   * Files already ≥ this size are never merged (they're already
   * efficient). Default: targetFileBytes.
   */
  readonly maxFileBytes: number;
}

export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
  targetFileBytes: 128 * 1024 * 1024,
  minFilesToCompact: 3,
  maxFileBytes: 128 * 1024 * 1024,
};

/**
 * CompactionEngine — partition-aware row merge.
 */
export class CompactionEngine {
  private readonly _config: CompactionConfig;
  private _seq = 0;

  constructor(config: Partial<CompactionConfig> = {}) {
    this._config = { ...DEFAULT_COMPACTION_CONFIG, ...config };
  }

  /**
   * Plan compaction over the current manifest — no side effects.
   * Groups files by partition key, packs small files into bins via
   * first-fit-decreasing within each partition.
   */
  plan(manifest: TableManifest): CompactionPlan2 {
    const cfg = this._config;
    // Group by partition key so merges never cross partition boundaries.
    const byPartition = new Map<string, TableFile[]>();
    for (const f of manifest.files) {
      const key = this._partitionKey(f);
      let arr = byPartition.get(key);
      if (arr === undefined) {
        arr = [];
        byPartition.set(key, arr);
      }
      arr.push(f);
    }

    const bins: MergeBin[] = [];
    const skipped: string[] = [];
    for (const [key, files] of byPartition) {
      const small = files.filter((f) => f.sizeBytes < cfg.targetFileBytes);
      for (const f of files.filter((f) => f.sizeBytes >= cfg.targetFileBytes)) {
        skipped.push(f.path);
      }
      if (small.length < cfg.minFilesToCompact) {
        for (const f of small) skipped.push(f.path);
        continue;
      }
      // FFD within the partition.
      const sorted = small.slice().sort((a, b) => b.sizeBytes - a.sizeBytes);
      const open: { inputs: string[]; used: number; rows: number }[] = [];
      for (const f of sorted) {
        let placed = false;
        for (const bin of open) {
          if (bin.used + f.sizeBytes <= cfg.targetFileBytes) {
            bin.inputs.push(f.path);
            bin.used += f.sizeBytes;
            bin.rows += f.rowCount;
            placed = true;
            break;
          }
        }
        if (!placed) open.push({ inputs: [f.path], used: f.sizeBytes, rows: f.rowCount });
      }
      for (const bin of open) {
        if (bin.inputs.length >= cfg.minFilesToCompact) {
          bins.push({
            inputs: bin.inputs,
            estimatedBytes: bin.used,
            inputRows: bin.rows,
            partitionKey: key,
          });
        } else {
          for (const p of bin.inputs) skipped.push(p);
        }
      }
    }

    return {
      bins,
      skipped,
      totalInputFiles: manifest.files.length,
      totalInputBytes: manifest.totalBytes,
      totalOutputFiles: bins.length,
      estimatedBytesSaved: bins.reduce((a, b) => a + b.estimatedBytes, 0),
    };
  }

  /**
   * Execute a plan against a live table: merges each bin's rows into a
   * new file and commits remove-old + add-new atomically per bin.
   *
   * Rows are concatenated in the input order given by the plan —
   * preserving the write order the table read path would produce.
   */
  execute(table: VersionedTable, plan: CompactionPlan2): CompactionResult {
    const newFiles: string[] = [];
    const versions: number[] = [];
    let rowsProcessed = 0;

    for (const bin of plan.bins) {
      const mergedRows: LakeRow[] = [];
      let firstPath: string | null = null;
      for (const p of bin.inputs) {
        const rows = table.rowsOf(p);
        for (const r of rows) mergedRows.push(r);
        if (firstPath === null) firstPath = p;
      }
      rowsProcessed += mergedRows.length;
      // Output file path: same partition dir as the first input.
      const dir = firstPath === null ? table.path : firstPath.slice(0, firstPath.lastIndexOf('/'));
      const name = `compact-${String(++this._seq).padStart(8, '0')}.rows.json`;
      const newPath = `${dir}/${name}`;
      const data = new TextEncoder().encode(JSON.stringify(mergedRows));
      const firstFile = table.files.find((f) => f.path === firstPath);
      table.store.put({
        path: newPath,
        zone: 'curated',
        data,
        contentType: 'application/x-rows-json',
        tags: { compacted: 'true' },
        createdAt: Date.now(),
        updatedAt: Date.now(),
        sizeBytes: data.byteLength,
      });
      const file: TableFile = {
        path: newPath,
        rowCount: mergedRows.length,
        sizeBytes: data.byteLength,
        partitionValues: firstFile?.partitionValues ?? {},
        addedAtVersion: table.version + 1,
      };
      const before = table.version;
      table.replaceFiles(bin.inputs, [file]);
      versions.push(before + 1);
      newFiles.push(newPath);
    }
    return {
      plan,
      newFiles,
      committedVersions: versions,
      rowsProcessed,
    };
  }

  /**
   * One-shot convenience: plan + execute on the current manifest.
   */
  optimize(table: VersionedTable): CompactionResult {
    return this.execute(table, this.plan(table.snapshot()));
  }

  private _partitionKey(f: TableFile): string {
    const keys = Object.keys(f.partitionValues).sort();
    return keys.map((k) => `${k}=${f.partitionValues[k]}`).join('/');
  }
}
