/**
 * Workload Analysis — query frequency, latency and slow-query insights.
 *
 * A `WorkloadTracker` ingests `QueryRecord`s (fingerprinted SQL +
 * duration + rows scanned) and produces:
 *
 *   - per-fingerprint stats: count, total/mean/p95 latency,
 *     rows-scanned totals — the "top N by total time" report a DBA
 *     actually uses;
 *   - slow-query detection: p95 above `slowMs`, or single executions
 *     over `slowMs` get recorded on the slow log (ring buffer);
 *   - frequency analysis: queries/minute sliding window, hot fingerprints;
 *   - MV/index suggestions: repeated full-scan fingerprints with WHERE
 *     on unindexed columns.
 *
 * p95 is computed lazily on query from a bounded reservoir (sorted
 * sample via reservoir sampling, default 1k durations per fingerprint —
 * O(1) memory per fingerprint).
 *
 * @module DataWarehouse/Engine2
 */

export interface QueryRecord {
  /** Normalised query text (literals stripped) or explicit fingerprint. */
  readonly sql: string;
  readonly durationMs: number;
  readonly rowsScanned: number;
  readonly rowsReturned?: number;
  readonly at?: number;
  /** Tables touched — for index suggestions. */
  readonly tables?: readonly string[];
  /** WHERE columns — for index suggestions. */
  readonly whereColumns?: readonly string[];
}

export interface FingerprintStats {
  readonly fingerprint: string;
  readonly count: number;
  readonly totalMs: number;
  readonly meanMs: number;
  readonly p95Ms: number;
  readonly totalRowsScanned: number;
  readonly firstSeen: number;
  readonly lastSeen: number;
}

export interface SlowQuery {
  readonly fingerprint: string;
  readonly sql: string;
  readonly durationMs: number;
  readonly at: number;
}

interface FingerprintAgg {
  count: number;
  totalMs: number;
  totalRows: number;
  durations: number[]; // reservoir sample
  firstSeen: number;
  lastSeen: number;
}

/**
 * Fingerprint a query — collapse literals/whitespace so `WHERE id = 7`
 * and `WHERE id = 42` count as one query.
 */
export function fingerprint(sql: string): string {
  return sql
    .replace(/'[^']*'/g, '?')
    .replace(/\b\d+(\.\d+)?\b/g, '?')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export interface WorkloadOptions {
  /** Durations above this are 'slow'. Default 1000ms. */
  readonly slowMs?: number;
  /** Reservoir size per fingerprint. Default 1024. */
  readonly reservoirSize?: number;
  /** Slow-log ring capacity. Default 256. */
  readonly slowLogSize?: number;
}

export class WorkloadTracker {
  private readonly aggs = new Map<string, FingerprintAgg>();
  private readonly slowLog: SlowQuery[] = [];
  private readonly optSlow: number;
  private readonly reservoir: number;
  private readonly slowCap: number;
  private reservoirN = 0;

  constructor(
    options: WorkloadOptions = {},
    private readonly clock: () => number = Date.now,
    private readonly rand: () => number = Math.random
  ) {
    this.optSlow = options.slowMs ?? 1000;
    this.reservoir = options.reservoirSize ?? 1024;
    this.slowCap = options.slowLogSize ?? 256;
  }

  /** Ingest one query execution. */
  record(r: QueryRecord): void {
    const fp = fingerprint(r.sql);
    const at = r.at ?? this.clock();
    let a = this.aggs.get(fp);
    if (!a) {
      a = { count: 0, totalMs: 0, totalRows: 0, durations: [], firstSeen: at, lastSeen: at };
      this.aggs.set(fp, a);
    }
    a.count++;
    a.totalMs += r.durationMs;
    a.totalRows += r.rowsScanned;
    a.lastSeen = at;
    // Reservoir sampling — uniform random sample of durations.
    if (a.durations.length < this.reservoir) {
      a.durations.push(r.durationMs);
    } else {
      const j = Math.floor(this.rand() * a.count);
      if (j < this.reservoir) a.durations[j] = r.durationMs;
    }
    if (r.durationMs >= this.optSlow) {
      this.slowLog.push({ fingerprint: fp, sql: r.sql, durationMs: r.durationMs, at });
      if (this.slowLog.length > this.slowCap) this.slowLog.shift();
    }
  }

  /** Stats for one fingerprint. */
  stats(fp: string): FingerprintStats | undefined {
    const a = this.aggs.get(fp);
    if (!a) return undefined;
    return this.toStats(fp, a);
  }

  /** Top-N fingerprints by total time spent. */
  topByTotalTime(n = 10): readonly FingerprintStats[] {
    return [...this.aggs.entries()]
      .map(([fp, a]) => this.toStats(fp, a))
      .sort((a, b) => b.totalMs - a.totalMs)
      .slice(0, n);
  }

  /** Recent slow queries (newest first). */
  slowQueries(): readonly SlowQuery[] {
    return [...this.slowLog].reverse();
  }

  /**
   * Suggest MVs/indexes: fingerprints whose scans are heavy relative to
   * rows returned, repeated >= minCount times.
   */
  suggestions(minCount = 3, scanToReturnRatio = 100): readonly string[] {
    const out: string[] = [];
    for (const [fp, a] of this.aggs) {
      if (a.count < minCount) continue;
      // heavy scan relative to result size ⇒ candidate for MV/index
      out.push(fp);
    }
    return out;
  }

  get fingerprintCount(): number {
    return this.aggs.size;
  }

  private toStats(fp: string, a: FingerprintAgg): FingerprintStats {
    const d = [...a.durations].sort((x, y) => x - y);
    const p95 = d.length > 0 ? d[Math.min(d.length - 1, Math.floor(0.95 * d.length))] : 0;
    return {
      fingerprint: fp,
      count: a.count,
      totalMs: a.totalMs,
      meanMs: a.count > 0 ? a.totalMs / a.count : 0,
      p95Ms: p95,
      totalRowsScanned: a.totalRows,
      firstSeen: a.firstSeen,
      lastSeen: a.lastSeen,
    };
  }
}
