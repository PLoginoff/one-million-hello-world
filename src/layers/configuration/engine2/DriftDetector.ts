/**
 * Configuration Engine2 — Configuration Drift Detection
 *
 * engine/ConfigDiffEngine diffs two configs chronologically (before vs
 * after a reload). Drift detection is the SPATIAL version: compare the
 * same logical config across environments (dev vs staging vs prod) or
 * against a blessed baseline, and report where they've diverged.
 *
 * Reports:
 *   - `drift(baseline, candidate)` — path-level delta with classification:
 *     'expected' (paths in `expectedDrift` like db.host differing per-env),
 *     'unexpected' (silent divergence — the thing drift detection exists
 *     to catch), 'missing' (candidate lacks a baseline path entirely).
 *   - `matrix(configs)` — n×n pairwise drift matrix answering "how far
 *     has staging wandered from prod, and prod from dev?" in one shot.
 *   - Tolerances: numeric paths can carry `tolerance` (|a−b| ≤ t counts
 *     as conforming) — replicas legitimately differ in pool sizes.
 *
 * Complexity: O(paths) per pair, O(envs² × paths) for the matrix —
 * env count is single-digit so this stays cheap.
 *
 * @module Configuration/Engine2
 */

import { ConfigValue, EffectiveConfig } from '../engine/ConfigTypes';

export type DriftKind = 'conforming' | 'expected' | 'unexpected' | 'missing' | 'extra';

export interface PathDrift {
  readonly path: string;
  readonly kind: DriftKind;
  readonly baseline: ConfigValue | undefined;
  readonly candidate: ConfigValue | undefined;
}

export interface DriftReport {
  readonly baselineName: string;
  readonly candidateName: string;
  readonly entries: readonly PathDrift[];
  /** unexpected + missing + extra count — the actionable number. */
  readonly unexpectedCount: number;
  /** unexpectedCount / total paths compared. */
  readonly driftRatio: number;
}

/** Per-path drift policy. */
export interface DriftPolicy {
  /** Paths that may differ across environments without flagging. */
  readonly expectedDrift?: ReadonlySet<string>;
  /** path → numeric tolerance; |baseline−candidate| ≤ t is conforming. */
  readonly tolerances?: Readonly<Record<string, number>>;
}

function valuesEqual(a: ConfigValue | undefined, b: ConfigValue | undefined): boolean {
  if (a === b) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

export class DriftDetector {
  constructor(private readonly _policy?: DriftPolicy) {}

  drift(baseline: EffectiveConfig, candidate: EffectiveConfig, names?: { baseline?: string; candidate?: string }): DriftReport {
    const entries: PathDrift[] = [];
    const bMap = baseline.flatten();
    const cMap = candidate.flatten();
    const paths = new Set([...Object.keys(bMap), ...Object.keys(cMap)]);

    for (const path of [...paths].sort()) {
      const b = bMap[path];
      const c = cMap[path];
      const kind = this._classify(path, b, c);
      if (kind !== 'conforming') {
        entries.push({ path, kind, baseline: b, candidate: c });
      }
    }

    const actionable = entries.filter(
      (e) => e.kind === 'unexpected' || e.kind === 'missing' || e.kind === 'extra'
    );
    return {
      baselineName: names?.baseline ?? 'baseline',
      candidateName: names?.candidate ?? 'candidate',
      entries,
      unexpectedCount: actionable.length,
      driftRatio: paths.size === 0 ? 0 : actionable.length / paths.size,
    };
  }

  private _classify(
    path: string,
    b: ConfigValue | undefined,
    c: ConfigValue | undefined
  ): DriftKind {
    if (b === undefined && c === undefined) return 'conforming';
    if (b === undefined) return 'extra'; // candidate invented a path
    if (c === undefined) return 'missing';
    if (valuesEqual(b, c)) return 'conforming';
    // Numeric tolerance: within ±t counts as conforming.
    const tol = this._policy?.tolerances?.[path];
    if (tol !== undefined && typeof b === 'number' && typeof c === 'number') {
      if (Math.abs(b - c) <= tol) return 'conforming';
    }
    return this._policy?.expectedDrift?.has(path) ? 'expected' : 'unexpected';
  }

  /**
   * Pairwise drift across named environments. Cell [i][j] is the drift
   * report of env i's config against env j as baseline (asymmetric: a
   * path missing from j shows differently than extra in i).
   */
  matrix(configs: Readonly<Record<string, EffectiveConfig>>): Map<string, Map<string, DriftReport>> {
    const names = Object.keys(configs);
    const out = new Map<string, Map<string, DriftReport>>();
    for (const a of names) {
      const row = new Map<string, DriftReport>();
      for (const b of names) {
        if (a === b) continue;
        row.set(b, this.drift(configs[a], configs[b], { baseline: a, candidate: b }));
      }
      out.set(a, row);
    }
    return out;
  }

  /** Only the actionable paths — what an alert would page on. */
  unexpectedPaths(report: DriftReport): readonly string[] {
    return report.entries
      .filter((e) => e.kind === 'unexpected' || e.kind === 'missing' || e.kind === 'extra')
      .map((e) => e.path);
  }
}
