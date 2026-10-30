/**
 * Canary Deploy — Shadow Response Comparison
 *
 * Compares live (production) responses with shadow (canary, dark-traffic)
 * responses for the same requests. Unlike `TrafficMirror` (which handles
 * sampling + transport), this analyzer owns the *comparison semantics*:
 *
 *  - Deep structural diff between response bodies, reporting JSON paths
 *    (dot-separated, `[i]` for array indices). Volatile paths (timestamps,
 *    request ids…) can be excluded by prefix.
 *  - Numeric tolerance: fields differing by ≤ `numericTolerance` relative
 *    fraction are NOT divergences (floats across builds drift).
 *  - Status-code comparison, shadow errors and timeouts classified into
 *    {@link DivergenceKind}.
 *  - Aggregate report: divergence rate, per-kind counts, per-path hot
 *    spots, and live-vs-shadow latency percentiles.
 *
 * Deep-diff algorithm: recursive walk over the union of keys at each
 * level — O(nodes) in the response tree. Arrays compare element-wise up
 * to the max length; extra elements on either side are diffs. Cycle-safe
 * via a depth bound (default 32) — response bodies should be trees.
 *
 * @module CanaryDeploy/Engine2
 */

import {
  Divergence,
  DivergenceKind,
  Engine2Clock,
  MirrorComparisonReport,
  ShadowExchange,
} from './CanaryEngine2Types';

function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[idx];
}

const MAX_DIFF_DEPTH = 32;

export class ShadowComparisonAnalyzer {
  private readonly _clock: Engine2Clock;
  private readonly _exchanges: ShadowExchange[] = [];
  private readonly _divergences: Divergence[] = [];
  private readonly _maxExchanges: number;
  private readonly _numericTolerance: number;
  private readonly _ignoredPaths: readonly string[];
  /** Timeout: shadow slower than this counts as 'timeout' divergence (ms). */
  private readonly _shadowTimeoutMs: number;

  constructor(
    options: {
      clock?: Engine2Clock;
      maxExchanges?: number;
      /** Relative numeric tolerance (e.g. 0.001 = 0.1%). Default 0 — exact. */
      numericTolerance?: number;
      /** Path prefixes excluded from body diffs (e.g. 'meta.requestId'). */
      ignorePaths?: ReadonlyArray<string>;
      /** Latency beyond which a shadow answer counts as a timeout (ms). */
      shadowTimeoutMs?: number;
    } = {}
  ) {
    this._clock = options.clock ?? Date.now;
    this._maxExchanges = options.maxExchanges ?? 50_000;
    this._numericTolerance = options.numericTolerance ?? 0;
    this._ignoredPaths = options.ignorePaths ?? [];
    this._shadowTimeoutMs = options.shadowTimeoutMs ?? 30_000;
  }

  get exchanges(): ReadonlyArray<ShadowExchange> {
    return this._exchanges;
  }

  get divergences(): ReadonlyArray<Divergence> {
    return this._divergences;
  }

  /** Is `path` under an ignored prefix? */
  private _ignored(path: string): boolean {
    return this._ignoredPaths.some((p) => path === p || path.startsWith(`${p}.`) || path.startsWith(`${p}[`));
  }

  /**
   * Deep-diff two values. Appends differing leaf paths to `out`.
   * Numbers within relative tolerance are skipped.
   */
  private _diff(a: unknown, b: unknown, path: string, out: string[], depth: number): void {
    if (this._ignored(path) || depth > MAX_DIFF_DEPTH) return;

    if (typeof a === 'number' && typeof b === 'number') {
      if (a === b) return;
      const base = Math.max(Math.abs(a), Math.abs(b));
      const rel = base === 0 ? 0 : Math.abs(a - b) / base;
      if (rel <= this._numericTolerance) return;
      out.push(path === '' ? '<root>' : path);
      return;
    }

    if (Object.is(a, b)) return;

    const aArr = Array.isArray(a);
    const bArr = Array.isArray(b);
    if (aArr && bArr) {
      const max = Math.max(a.length, b.length);
      for (let i = 0; i < max; i++) {
        const p = `${path}[${i}]`;
        if (i >= a.length || i >= b.length) {
          out.push(p);
        } else {
          this._diff(a[i], b[i], p, out, depth + 1);
        }
      }
      return;
    }

    const aObj = a !== null && typeof a === 'object' && !aArr;
    const bObj = b !== null && typeof b === 'object' && !bArr;
    if (aObj && bObj) {
      const aRec = a as Record<string, unknown>;
      const bRec = b as Record<string, unknown>;
      const keys = new Set([...Object.keys(aRec), ...Object.keys(bRec)]);
      for (const k of keys) {
        const p = path === '' ? k : `${path}.${k}`;
        if (!(k in aRec) || !(k in bRec)) {
          out.push(p);
        } else {
          this._diff(aRec[k], bRec[k], p, out, depth + 1);
        }
      }
      return;
    }

    // Type mismatch or unequal primitives.
    out.push(path === '' ? '<root>' : path);
  }

  /**
   * Classify and record one shadow exchange. Returns the Divergence, or
   * null when the responses matched (kind 'none' is still recorded in
   * counts — callers get null for ergonomic `if (d)` handling).
   */
  compare(exchange: ShadowExchange): Divergence | null {
    this._exchanges.push(exchange);
    if (this._exchanges.length > this._maxExchanges) {
      this._exchanges.splice(0, this._exchanges.length - this._maxExchanges);
    }

    const { live, shadow } = exchange;
    let kind: DivergenceKind = 'none';
    let diffPaths: string[] = [];
    let latencyDelta: number | undefined;

    if (shadow.error !== undefined) {
      kind = 'shadow-error';
    } else if (shadow.latencyMs !== undefined && shadow.latencyMs > this._shadowTimeoutMs) {
      kind = 'timeout';
      latencyDelta = shadow.latencyMs - live.latencyMs;
    } else if (shadow.status !== live.status) {
      kind = 'status-mismatch';
    } else {
      this._diff(live.body, shadow.body, '', diffPaths, 0);
      if (diffPaths.length > 0) {
        kind = 'body-mismatch';
      }
      if (shadow.latencyMs !== undefined) {
        latencyDelta = shadow.latencyMs - live.latencyMs;
      }
    }

    if (kind === 'none') return null;

    const div: Divergence = {
      requestId: exchange.requestId,
      path: exchange.path,
      kind,
      diffPaths,
      liveStatus: live.status,
      shadowStatus: shadow.status,
      shadowError: shadow.error,
      latencyDeltaMs: latencyDelta,
    };
    this._divergences.push(div);
    if (this._divergences.length > this._maxExchanges) {
      this._divergences.splice(0, this._divergences.length - this._maxExchanges);
    }
    return div;
  }

  /**
   * Aggregate report over all recorded exchanges.
   * `topPaths` bounds the hot-path list (default 10).
   */
  report(topPaths = 10): MirrorComparisonReport {
    const byKind: Record<string, number> = {};
    const pathCounts = new Map<string, number>();
    const liveLat: number[] = [];
    const shadowLat: number[] = [];
    let diverged = 0;
    let errored = 0;

    const divByRequest = new Map(this._divergences.map((d) => [d.requestId, d]));

    for (const ex of this._exchanges) {
      const div = divByRequest.get(ex.requestId);
      if (div) {
        diverged++;
        byKind[div.kind] = (byKind[div.kind] ?? 0) + 1;
        if (div.kind === 'shadow-error' || div.kind === 'timeout') errored++;
        pathCounts.set(ex.path, (pathCounts.get(ex.path) ?? 0) + 1);
      }
      if (ex.shadow.latencyMs !== undefined) {
        liveLat.push(ex.live.latencyMs);
        shadowLat.push(ex.shadow.latencyMs);
      }
    }

    liveLat.sort((a, b) => a - b);
    shadowLat.sort((a, b) => a - b);
    const liveP50 = percentile(liveLat, 0.5);
    const liveP99 = percentile(liveLat, 0.99);
    const shadowP50 = percentile(shadowLat, 0.5);
    const shadowP99 = percentile(shadowLat, 0.99);

    const hotPaths = [...pathCounts.entries()]
      .map(([path, divergences]) => ({ path, divergences }))
      .sort((a, b) => b.divergences - a.divergences)
      .slice(0, topPaths);

    const total = this._exchanges.length;
    return {
      total,
      identical: total - diverged,
      diverged,
      errored,
      divergenceRate: total === 0 ? 0 : diverged / total,
      byKind,
      hotPaths,
      latency: {
        liveP50,
        shadowP50,
        liveP99,
        shadowP99,
        p99Delta: shadowP99 - liveP99,
      },
    };
  }

  reset(): void {
    this._exchanges.length = 0;
    this._divergences.length = 0;
  }

  /** Exposed for tests/diagnostics — clock passthrough. */
  now(): number {
    return this._clock();
  }
}
