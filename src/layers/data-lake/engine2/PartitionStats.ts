/**
 * Partition Statistics & Skew Detection
 *
 * Real query engines need partition-level stats to make pruning and
 * join-ordering decisions — and ops teams need them to spot the "one
 * hot partition" pathology before it stalls a job. This module computes
 * per-partition statistics from a `TableManifest` and detects skew.
 *
 * Computed per partition:
 *   - row count, byte size, file count
 *   - avg/min/max file size (files too small → compaction candidate)
 *   - share of the table (rows% and bytes%)
 *
 * Skew detection uses two complementary measures — the standard pair
 * real partition-health dashboards (Iceberg, Hudi metrics) expose:
 *
 *   1. **Gini coefficient** over per-partition row counts — the classic
 *      inequality measure; 0 = perfectly balanced, →1 = one partition
 *      has everything.
 *   2. **Max-to-median ratio** — the "hot partition" detector: the
 *      largest partition's size relative to the median. >2× is the
 *      usual alert threshold.
 *
 * Complexity: O(#files + #partitions log #partitions).
 *
 * @module DataLake/Engine2
 */

import { TableManifest, TableFile } from './VersionedTable';

/** Stats for one partition. */
export interface PartitionStat {
  /** Partition key in `a=1/b=2` form; '' for unpartitioned. */
  readonly key: string;
  readonly partitionValues: Readonly<Record<string, string>>;
  readonly rowCount: number;
  readonly byteSize: number;
  readonly fileCount: number;
  readonly avgFileBytes: number;
  readonly minFileBytes: number;
  readonly maxFileBytes: number;
  /** rowCount / totalTableRows. */
  readonly rowShare: number;
  /** byteSize / totalTableBytes. */
  readonly byteShare: number;
}

/** Aggregate skew metrics. */
export interface SkewReport {
  /** Gini coefficient over per-partition rows (0..1). */
  readonly gini: number;
  /** largest.partitionRows / median.partitionRows; Infinity if median=0. */
  readonly maxToMedianRatio: number;
  /** True when skew exceeds the configured threshold. */
  readonly skewed: boolean;
  /** The offending partition keys (sorted by row count desc). */
  readonly hotPartitions: readonly string[];
  /** Partitions suspiciously small (below smallPartitionFrac of median). */
  readonly coldPartitions: readonly string[];
}

/** Full partition analysis. */
export interface PartitionAnalysis {
  readonly stats: readonly PartitionStat[];
  readonly skew: SkewReport;
  readonly totalRows: number;
  readonly totalBytes: number;
  readonly partitionCount: number;
}

/** Tuning. */
export interface PartitionStatsConfig {
  /** maxToMedian above this → skewed. Default 2.0. */
  readonly skewThreshold: number;
  /**
   * Fraction of median below which a partition counts as "cold" —
   * candidates for merge or redistribution. Default 0.1.
   */
  readonly coldPartitionFrac: number;
  /**
   * File-count-per-partition above which the partition is flagged a
   * small-file compaction candidate. Default 10.
   */
  readonly smallFileThreshold: number;
  /** Top-N hot partitions reported. Default 5. */
  readonly hotTopN: number;
}

export const DEFAULT_PARTITION_STATS_CONFIG: PartitionStatsConfig = {
  skewThreshold: 2.0,
  coldPartitionFrac: 0.1,
  smallFileThreshold: 10,
  hotTopN: 5,
};

/**
 * PartitionStats — partition-level table statistics.
 */
export class PartitionStats {
  private readonly _config: PartitionStatsConfig;

  constructor(config: Partial<PartitionStatsConfig> = {}) {
    this._config = { ...DEFAULT_PARTITION_STATS_CONFIG, ...config };
  }

  /**
   * Compute per-partition stats for a manifest.
   */
  analyze(manifest: TableManifest): PartitionAnalysis {
    const cfg = this._config;
    const groups = new Map<string, { values: Record<string, string>; files: TableFile[] }>();
    for (const f of manifest.files) {
      const key = this._key(f.partitionValues);
      let g = groups.get(key);
      if (g === undefined) {
        g = { values: { ...f.partitionValues }, files: [] as TableFile[] };
        groups.set(key, g);
      }
      g.files.push(f);
    }

    const stats: PartitionStat[] = [];
    for (const [key, g] of groups) {
      const rows = g.files.reduce((a, f) => a + f.rowCount, 0);
      const bytes = g.files.reduce((a, f) => a + f.sizeBytes, 0);
      const sizes = g.files.map((f) => f.sizeBytes);
      stats.push({
        key,
        partitionValues: g.values,
        rowCount: rows,
        byteSize: bytes,
        fileCount: g.files.length,
        avgFileBytes: g.files.length === 0 ? 0 : bytes / g.files.length,
        minFileBytes: sizes.length === 0 ? 0 : Math.min(...sizes),
        maxFileBytes: sizes.length === 0 ? 0 : Math.max(...sizes),
        rowShare: manifest.totalRows === 0 ? 0 : rows / manifest.totalRows,
        byteShare: manifest.totalBytes === 0 ? 0 : bytes / manifest.totalBytes,
      });
    }
    stats.sort((a, b) => b.rowCount - a.rowCount);

    const rowCounts = stats.map((s) => s.rowCount).sort((a, b) => a - b);
    const median = this._median(rowCounts);
    const max = rowCounts.length === 0 ? 0 : rowCounts[rowCounts.length - 1];
    const gini = this._gini(rowCounts);
    const maxToMedian = median === 0 ? (max === 0 ? 1 : Number.POSITIVE_INFINITY) : max / median;

    const hot = stats.slice(0, cfg.hotTopN).map((s) => s.key);
    const cold = stats
      .filter((s) => median > 0 && s.rowCount < median * cfg.coldPartitionFrac)
      .map((s) => s.key);
    const skewed = maxToMedian > cfg.skewThreshold || gini > 0.5;

    return {
      stats,
      skew: { gini, maxToMedianRatio: maxToMedian, skewed, hotPartitions: hot, coldPartitions: cold },
      totalRows: manifest.totalRows,
      totalBytes: manifest.totalBytes,
      partitionCount: groups.size,
    };
  }

  /**
   * Which partitions are small-file candidates (many tiny files).
   */
  compactionCandidates(manifest: TableManifest): PartitionStat[] {
    return this.analyze(manifest).stats.filter(
      (s) => s.fileCount >= this._config.smallFileThreshold
    );
  }

  /* ----- internals ------------------------------------------------------- */

  private _key(values: Record<string, string>): string {
    return Object.keys(values)
      .sort()
      .map((k) => `${k}=${values[k]}`)
      .join('/');
  }

  private _median(sorted: readonly number[]): number {
    if (sorted.length === 0) return 0;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  /**
   * Gini coefficient over a sorted-ascending array — the standard
   * inequality measure:
   *   G = Σ_i (2i − n − 1) x_i / (n Σ x_i)
   */
  private _gini(sorted: readonly number[]): number {
    const n = sorted.length;
    if (n === 0) return 0;
    const sum = sorted.reduce((a, b) => a + b, 0);
    if (sum === 0) return 0;
    let num = 0;
    for (let i = 0; i < n; i++) {
      num += (2 * (i + 1) - n - 1) * sorted[i];
    }
    return num / (n * sum);
  }
}
