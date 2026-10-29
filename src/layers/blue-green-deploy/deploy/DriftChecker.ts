/**
 * Blue-Green Deploy — Configuration Drift Checker
 *
 * Compares the desired environment spec (env vars, resource limits, ports,
 * feature flags) against the actually-deployed spec and reports drift.
 * Catching drift before a traffic switch is a real blue-green failure mode:
 * "green is running v2 but with v1's config" looks healthy in smoke tests
 * yet breaks under production load.
 *
 * Comparison is a three-way classification per key — `added`, `removed`,
 * `changed` — plus value masking for secrets (compared by hash presence,
 * never by logged value). O(K) for K config keys.
 *
 * @module BlueGreenDeploy/Deploy
 */

export type ConfigValue = string | number | boolean;

export type ConfigSpec = Readonly<Record<string, ConfigValue>>;

export interface DriftEntry {
  readonly key: string;
  readonly kind: 'added' | 'removed' | 'changed';
  /** Masked: values are reported only as present/different, never literal. */
  readonly expectedPresent: boolean;
  readonly actualPresent: boolean;
}

export interface DriftReport {
  readonly drifted: boolean;
  readonly driftScore: number;
  readonly entries: ReadonlyArray<DriftEntry>;
  readonly identicalKeys: number;
}

export class DriftChecker {
  /** Keys matching these substrings are masked in reports (secrets). */
  private readonly _secretPatterns: readonly string[];

  constructor(secretPatterns: readonly string[] = ['password', 'secret', 'token', 'key']) {
    this._secretPatterns = secretPatterns;
  }

  private _isSecret(key: string): boolean {
    const lower = key.toLowerCase();
    return this._secretPatterns.some((p) => lower.includes(p));
  }

  /**
   * Diff desired vs actual. Secret values are still compared — but reported
   * only as a changed flag with no values attached.
   */
  diff(desired: ConfigSpec, actual: ConfigSpec): DriftReport {
    const entries: DriftEntry[] = [];
    let identical = 0;
    const keys = new Set([...Object.keys(desired), ...Object.keys(actual)]);
    for (const key of keys) {
      const inDesired = key in desired;
      const inActual = key in actual;
      if (inDesired && !inActual) {
        entries.push({ key, kind: 'removed', expectedPresent: true, actualPresent: false });
      } else if (!inDesired && inActual) {
        entries.push({ key, kind: 'added', expectedPresent: false, actualPresent: true });
      } else if (desired[key] !== actual[key]) {
        entries.push({ key, kind: 'changed', expectedPresent: true, actualPresent: true });
      } else {
        identical++;
      }
    }
    entries.sort((a, b) => a.key.localeCompare(b.key));
    const total = keys.size;
    const drifted = entries.length > 0;
    return {
      drifted,
      // Weight secrets' drift higher: a leaked/missing secret is worse than
      // a benign flag difference. Secret entries count double.
      driftScore:
        total === 0
          ? 0
          : entries.reduce((acc, e) => acc + (this._isSecret(e.key) ? 2 : 1), 0) / (total * 2),
      entries,
      identicalKeys: identical,
    };
  }

  /** Whether the drift is acceptable under `maxScore` / tolerated keys. */
  acceptable(report: DriftReport, maxScore = 0, toleratedKeys: readonly string[] = []): boolean {
    const tolerated = new Set(toleratedKeys);
    const remaining = report.entries.filter((e) => !tolerated.has(e.key));
    if (remaining.length === 0) return true;
    return report.driftScore <= maxScore;
  }
}
