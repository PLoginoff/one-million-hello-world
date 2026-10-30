/**
 * Flag Exporter / Importer — portable JSON bundles of flag definitions.
 *
 * Moving flag config between environments (dev → staging → prod) or
 * taking a config snapshot needs a portable, *validated* format. The
 * bundle carries schema version + exported-at metadata; the importer
 * validates structure and semantics (variant references, rollout weight
 * sums, dependency targets) so a hand-edited or corrupted file fails
 * loudly instead of silently mis-evaluating.
 *
 * Validation is deliberately strict-but-total: collect *all* problems
 * rather than throw on the first — a broken export should print every
 * error in one pass, not make the operator fix-and-retry N times.
 *
 * @module FeatureFlags/Engine2
 */

import { FeatureFlag, FlagType, Segment } from '../domain/flag-model';
import { FlagStore, InMemoryFlagStore } from '../implementations/FlagEvaluator';
import { FlagDependencyGraph } from './FlagDependencyGraph';

export const BUNDLE_FORMAT = 'omhw/feature-flags';
export const BUNDLE_VERSION = 1;

export interface FlagBundle {
  readonly format: typeof BUNDLE_FORMAT;
  readonly version: number;
  readonly exportedAt: number;
  readonly flags: readonly FeatureFlag[];
  readonly segments: readonly Segment[];
}

export interface ImportIssue {
  readonly path: string;
  readonly message: string;
}

export interface ImportResult {
  readonly ok: boolean;
  readonly issues: readonly ImportIssue[];
  readonly flagsImported: number;
  readonly segmentsImported: number;
}

const FLAG_TYPES: readonly FlagType[] = ['boolean', 'multivariate', 'json'];

export class FlagExporter {
  /** Snapshot the store into a portable bundle. */
  static export(store: FlagStore, now = Date.now()): FlagBundle {
    return {
      format: BUNDLE_FORMAT,
      version: BUNDLE_VERSION,
      exportedAt: now,
      flags: store.allFlags(),
      segments: store.allSegments(),
    };
  }

  /** Serialise a bundle — stable key order for diff-friendly output. */
  static serialize(bundle: FlagBundle): string {
    return JSON.stringify(bundle, null, 2);
  }

  /** Parse + validate a bundle without touching the store. */
  static validate(json: string | object): { bundle: FlagBundle | null; issues: ImportIssue[] } {
    const issues: ImportIssue[] = [];
    let raw: unknown;
    try {
      raw = typeof json === 'string' ? JSON.parse(json) : json;
    } catch (err) {
      return { bundle: null, issues: [{ path: '$', message: `invalid JSON: ${(err as Error).message}` }] };
    }

    if (typeof raw !== 'object' || raw === null) {
      return { bundle: null, issues: [{ path: '$', message: 'bundle must be an object' }] };
    }
    const b = raw as Record<string, unknown>;
    if (b.format !== BUNDLE_FORMAT) {
      issues.push({ path: '$.format', message: `expected "${BUNDLE_FORMAT}", got ${JSON.stringify(b.format)}` });
    }
    if (typeof b.version !== 'number' || b.version > BUNDLE_VERSION) {
      issues.push({ path: '$.version', message: `unsupported version ${JSON.stringify(b.version)}` });
    }
    if (!Array.isArray(b.flags)) {
      issues.push({ path: '$.flags', message: 'flags must be an array' });
    }
    const flags = (Array.isArray(b.flags) ? b.flags : []) as unknown[];
    flags.forEach((f, i) => FlagExporter._validateFlag(f, `$.flags[${i}]`, issues));

    // Cross-flag check: dependencies resolvable + acyclic.
    const validFlags = flags.filter(
      (f): f is FeatureFlag =>
        typeof f === 'object' && f !== null && typeof (f as FeatureFlag).key === 'string'
    );
    const graph = FlagDependencyGraph.from(validFlags);
    for (const issue of graph.report(validFlags).issues) {
      issues.push({ path: '$.flags', message: issue.detail });
    }

    const segments = (Array.isArray(b.segments) ? b.segments : []) as Segment[];
    if (issues.length > 0) return { bundle: null, issues };
    return {
      bundle: {
        format: BUNDLE_FORMAT,
        version: BUNDLE_VERSION,
        exportedAt: typeof b.exportedAt === 'number' ? b.exportedAt : 0,
        flags: validFlags,
        segments,
      },
      issues,
    };
  }

  /**
   * Validate then load into a mutable store. Atomic: nothing imports on
   * error. Takes {@link InMemoryFlagStore} — the FlagStore interface is
   * read-only by design, so imports need the concrete store.
   */
  static import(store: InMemoryFlagStore, json: string | object): ImportResult {
    const { bundle, issues } = FlagExporter.validate(json);
    if (!bundle) {
      return { ok: false, issues, flagsImported: 0, segmentsImported: 0 };
    }
    for (const s of bundle.segments) store.putSegment(s);
    for (const f of bundle.flags) store.putFlag(f);
    return {
      ok: true,
      issues: [],
      flagsImported: bundle.flags.length,
      segmentsImported: bundle.segments.length,
    };
  }

  /* ---------------------------------------------------------------- */

  private static _validateFlag(f: unknown, path: string, issues: ImportIssue[]): void {
    if (typeof f !== 'object' || f === null) {
      issues.push({ path, message: 'flag must be an object' });
      return;
    }
    const flag = f as FeatureFlag & Record<string, unknown>;
    if (typeof flag.key !== 'string' || flag.key.length === 0) {
      issues.push({ path: `${path}.key`, message: 'flag.key must be a non-empty string' });
    }
    if (!FLAG_TYPES.includes(flag.type)) {
      issues.push({ path: `${path}.type`, message: `invalid type ${JSON.stringify(flag.type)}` });
    }
    if (typeof flag.enabled !== 'boolean') {
      issues.push({ path: `${path}.enabled`, message: 'flag.enabled must be boolean' });
    }
    // Variant references must resolve.
    const variantIds = new Set((flag.variants ?? []).map((v) => v.id));
    if (flag.defaultVariant !== undefined && !variantIds.has(flag.defaultVariant)) {
      issues.push({
        path: `${path}.defaultVariant`,
        message: `defaultVariant "${flag.defaultVariant}" not in variants [${[...variantIds].join(', ')}]`,
      });
    }
    // Rollout weights must be non-negative and sum to ≤100.
    for (const [ri, rule] of (flag.rules ?? []).entries()) {
      if (rule.rollout) {
        const total = rule.rollout.weights.reduce((a, w) => a + w.weight, 0);
        if (total > 100) {
          issues.push({
            path: `${path}.rules[${ri}].rollout`,
            message: `rollout weights sum to ${total} > 100`,
          });
        }
        for (const w of rule.rollout.weights) {
          if (w.weight < 0) {
            issues.push({ path: `${path}.rules[${ri}].rollout`, message: 'negative weight' });
          }
          if (!variantIds.has(w.variant)) {
            issues.push({
              path: `${path}.rules[${ri}].rollout`,
              message: `rollout references unknown variant "${w.variant}"`,
            });
          }
        }
      }
    }
  }
}
