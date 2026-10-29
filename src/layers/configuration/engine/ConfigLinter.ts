/**
 * Configuration Engine — Linter
 *
 * Static analysis over a config payload *before* it ever reaches the
 * engine: catches the mistakes that schema validation can't (because the
 * schema doesn't know about conventions):
 *
 *   - `suspicious-type`: env-style string `"8080"` where a sibling rule
 *     declares the path numeric — the config was loaded without coercion.
 *   - `secret-in-plain`: a key matching a secret pattern whose value looks
 *     like a real secret (entropy heuristic) sitting in a non-secret layer.
 *   - `unresolved-interpolation`: `${ref}` patterns left in values —
 *     flagged when the referenced path doesn't exist anywhere in the
 *     payload (self-contained check, no engine needed).
 *   - `shadowed-key`: a lower-precedence value that can never win because
 *     a higher-precedence sibling covers the whole subtree
 *     (`db` as object in defaults vs `db.host` scalar in env).
 *   - `deprecated-key`: paths on a caller-supplied deprecation list.
 *
 * Returns findings, not throws — a lint run is a report, not a gate
 * (callers decide `error` severity policy).
 *
 * @module Configuration/Engine
 */

import { ConfigObject, ConfigValue, SchemaRule, isConfigObject } from './ConfigTypes';
import { flattenTree } from './ConfigMerger';
import { pathPatternToRegex } from './SecretMasker';
import { ConfigInterpolator } from './ConfigInterpolator';

export type LintSeverity = 'error' | 'warning' | 'info';

export interface LintFinding {
  readonly rule: string;
  readonly path: string;
  readonly severity: LintSeverity;
  readonly message: string;
}

export interface LintOptions {
  /** Schema rules — used to detect type mismatches pre-load. */
  readonly schema?: ReadonlyArray<SchemaRule>;
  /** Secret patterns — flag high-entropy values under them in low tiers. */
  readonly secretPatterns?: ReadonlyArray<string>;
  /** Deprecated paths. */
  readonly deprecatedPaths?: ReadonlyArray<string>;
  /** Layer precedence info — enables `shadowed-key` checks. Values are
   *  precedence tiers; lower number = lower precedence. */
  readonly layerTiers?: Readonly<Record<string, number>>;
}

/** Shannon entropy of a string — cheap "does this look like a secret" test. */
export function entropy(s: string): number {
  if (s.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let h = 0;
  for (const n of freq.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

const ENV_NUMBERISH = /^-?\d+(\.\d+)?$/;
const ENV_BOOLISH = /^(true|false|yes|no|on|off|0|1)$/i;

export class ConfigLinter {
  private readonly _opts: LintOptions;

  constructor(options: LintOptions = {}) {
    this._opts = options;
  }

  /**
   * Lint one layer's payload. `layerName` identifies which layer the entries
   * came from for finding attribution + tier checks.
   */
  lint(layerName: string, entries: Readonly<Record<string, ConfigValue>> | ConfigObject, isFlat = false): LintFinding[] {
    const flat: Record<string, ConfigValue> = isFlat ? { ...(entries as Record<string, ConfigValue>) } : flattenTree(entries as ConfigObject);
    const findings: LintFinding[] = [];

    findings.push(...this._deprecated(flat));
    findings.push(...this._typeCheck(flat));
    findings.push(...this._secrets(layerName, flat));
    findings.push(...this._unresolved(flat));

    return findings;
  }

  /**
   * Cross-layer check: find lower-tier keys that can never take effect
   * because a higher-tier layer sets the same path (or a scalar sits on a
   * branch position the higher tier fills with a subtree).
   * `layers` is a map name → flat entries; precedence comes from
   * `layerTiers` (required for this check — skipped without it).
   */
  lintShadowed(layers: Readonly<Record<string, Record<string, ConfigValue>>>): LintFinding[] {
    const tiers = this._opts.layerTiers;
    if (!tiers) return [];
    const out: LintFinding[] = [];
    const names = Object.keys(layers).filter((n) => tiers[n] !== undefined);
    // For each lower-tier key, check if a strictly-higher tier sets the same
    // path — the lower value is dead config (worth a warning, often cruft).
    for (const low of names) {
      for (const high of names) {
        if ((tiers[high] as number) <= (tiers[low] as number)) continue;
        const highPaths = new Set(Object.keys(layers[high]));
        for (const p of Object.keys(layers[low])) {
          if (highPaths.has(p)) {
            out.push({
              rule: 'shadowed-key',
              path: p,
              severity: 'info',
              message: `'${p}' in layer '${low}' is shadowed by higher-tier layer '${high}'`,
            });
          }
        }
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ rules

  private _deprecated(flat: Record<string, ConfigValue>): LintFinding[] {
    const deprecated = new Set(this._opts.deprecatedPaths ?? []);
    const out: LintFinding[] = [];
    for (const p of Object.keys(flat)) {
      if (deprecated.has(p)) {
        out.push({ rule: 'deprecated-key', path: p, severity: 'warning', message: `config key '${p}' is deprecated` });
      }
    }
    return out;
  }

  private _typeCheck(flat: Record<string, ConfigValue>): LintFinding[] {
    const out: LintFinding[] = [];
    for (const rule of this._opts.schema ?? []) {
      // Only exact-path rules are checkable without the merged tree.
      if (rule.path.includes('*') || rule.type === undefined) continue;
      const v = flat[rule.path];
      if (v === undefined) continue;
      const problem = this._typeProblem(rule.type, v);
      if (problem !== undefined) {
        out.push({ rule: 'suspicious-type', path: rule.path, severity: 'warning', message: problem });
      }
    }
    return out;
  }

  private _typeProblem(type: NonNullable<SchemaRule['type']>, v: ConfigValue): string | undefined {
    switch (type) {
      case 'number':
        if (typeof v === 'number') return undefined;
        if (typeof v === 'string' && ENV_NUMBERISH.test(v.trim())) {
          return `string '${v}' looks numeric — env coercion will handle it, but storing as string bypasses range checks`;
        }
        return `expected number, got ${typeof v}`;
      case 'boolean':
        if (typeof v === 'boolean') return undefined;
        if (typeof v === 'string' && ENV_BOOLISH.test(v.trim())) return undefined; // coercible — fine
        return `expected boolean, got ${typeof v}`;
      case 'string':
        if (typeof v === 'string') return undefined;
        return `expected string, got ${typeof v}`;
      case 'array':
        return Array.isArray(v) ? undefined : `expected array, got ${typeof v}`;
      case 'object':
        return isConfigObject(v) ? undefined : `expected object, got ${typeof v}`;
    }
  }

  private _secrets(layerName: string, flat: Record<string, ConfigValue>): LintFinding[] {
    const patterns = (this._opts.secretPatterns ?? []).map(pathPatternToRegex);
    if (patterns.length === 0) return [];
    const tier = this._opts.layerTiers?.[layerName];
    const out: LintFinding[] = [];
    for (const [p, v] of Object.entries(flat)) {
      if (!patterns.some((r) => r.test(p))) continue;
      if (typeof v !== 'string') continue;
      // Flag real-looking secrets only in low tiers (defaults, checked-in
      // files) — env/remote legitimately carry them.
      if (tier !== undefined && tier >= 2) continue;
      if (v.length >= 8 && entropy(v) > 3.0) {
        out.push({
          rule: 'secret-in-plain',
          path: p,
          severity: 'error',
          message: `high-entropy value under secret path '${p}' in low-tier layer '${layerName}' — secrets should live in env/remote tiers`,
        });
      }
    }
    return out;
  }

  private _unresolved(flat: Record<string, ConfigValue>): LintFinding[] {
    const out: LintFinding[] = [];
    const paths = new Set(Object.keys(flat));
    for (const [p, v] of Object.entries(flat)) {
      if (typeof v !== 'string' || !ConfigInterpolator.hasPlaceholders(v)) continue;
      for (const m of v.matchAll(/\$\{([^}]+)\}/g)) {
        const ref = m[1].split(':-')[0].trim();
        // A ref that doesn't exist in this layer might resolve at merge
        // time — flag as info, not error (cross-layer refs are legitimate).
        if (!paths.has(ref) && !m[1].includes(':-')) {
          out.push({
            rule: 'unresolved-interpolation',
            path: p,
            severity: 'info',
            message: `reference '${ref}' is not defined in this layer — must resolve at merge or will stay literal`,
          });
        }
      }
    }
    return out;
  }


}
