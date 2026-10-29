/**
 * API Versioning — Sunset Schedule + Compliance Checker
 *
 * Two operational concerns:
 *
 *   1. `SunsetSchedule`: the timeline of upcoming removals — which versions
 *      sunset when, sorted by date, with "versions sunsetting within N
 *      days" queries for operator dashboards and client warning emails.
 *   2. `VersionCompliance`: is this API's version policy being followed?
 *      Rules like "at most N major versions in supported state", "beta
 *      versions must have a sunset date", "deprecated versions must name a
 *      successor". Emits violations, not enforcement — the caller decides.
 *
 * @module ApiVersioning/Negotiation
 */

import { VersionEntry, VersionMatrix, VersionStatus, VersionClock } from './VersionMatrix';
import { SemVer } from './SemVer';

export interface UpcomingSunset {
  readonly version: string;
  readonly sunsetAt: number;
  readonly daysUntil: number;
  readonly successor?: string;
}

export class SunsetSchedule {
  private readonly _matrix: VersionMatrix;
  private readonly _clock: VersionClock;

  constructor(matrix: VersionMatrix, clock: VersionClock = Date.now) {
    this._matrix = matrix;
    this._clock = clock;
  }

  /** All versions with a declared `sunsetAt`, sorted by date. */
  upcoming(now?: number): UpcomingSunset[] {
    const t = now ?? this._clock();
    const out: UpcomingSunset[] = [];
    for (const v of this._matrix.versions()) {
      const e = this._matrix.get(v);
      if (e?.sunsetAt === undefined) continue;
      out.push({
        version: v,
        sunsetAt: e.sunsetAt,
        daysUntil: Math.ceil((e.sunsetAt - t) / 86_400_000),
        ...(e.successor !== undefined ? { successor: e.successor } : {}),
      });
    }
    return out.sort((a, b) => a.sunsetAt - b.sunsetAt);
  }

  /** Versions sunsetting within `days` of `now` (or already past). */
  within(days: number, now?: number): UpcomingSunset[] {
    return this.upcoming(now).filter((u) => u.daysUntil <= days);
  }

  /** The next version to sunset (soonest upcoming). */
  next(now?: number): UpcomingSunset | undefined {
    const future = this.upcoming(now).filter((u) => u.daysUntil > 0);
    return future[0];
  }
}

export interface ComplianceRule {
  readonly name: string;
  readonly description: string;
  check(entries: ReadonlyArray<VersionEntry>): ComplianceViolation[];
}

export interface ComplianceViolation {
  readonly rule: string;
  readonly version?: string;
  readonly message: string;
  readonly severity: 'error' | 'warning';
}

/** Built-in rules most API governance programs actually enforce. */
export const COMPLIANCE_RULES: ReadonlyArray<ComplianceRule> = [
  {
    name: 'supported-count',
    description: 'At most 3 concurrently supported major versions.',
    check: (entries) => {
      const supported = entries.filter((e) => e.status === VersionStatus.SUPPORTED);
      const majors = new Set(
        supported.map((e) => {
          try {
            return (SemVer.coerce(e.version) ?? SemVer.parse(e.version)).major;
          } catch {
            return e.version;
          }
        })
      );
      if (majors.size <= 3) return [];
      return [{ rule: 'supported-count', message: `${majors.size} major versions are supported (max 3)`, severity: 'warning' as const }];
    },
  },
  {
    name: 'deprecated-needs-successor',
    description: 'Deprecated versions must name a successor.',
    check: (entries) =>
      entries
        .filter((e) => e.status === VersionStatus.DEPRECATED && e.successor === undefined)
        .map((e) => ({
          rule: 'deprecated-needs-successor',
          version: e.version,
          message: `deprecated version '${e.version}' has no successor`,
          severity: 'error' as const,
        })),
  },
  {
    name: 'beta-needs-sunset',
    description: 'Beta versions must declare a sunset date (they must not live forever).',
    check: (entries) =>
      entries
        .filter((e) => e.status === VersionStatus.BETA && e.sunsetAt === undefined)
        .map((e) => ({
          rule: 'beta-needs-sunset',
          version: e.version,
          message: `beta version '${e.version}' has no sunset date`,
          severity: 'warning' as const,
        })),
  },
  {
    name: 'deprecated-needs-sunset',
    description: 'Deprecated versions must declare a sunset date.',
    check: (entries) =>
      entries
        .filter((e) => e.status === VersionStatus.DEPRECATED && e.sunsetAt === undefined)
        .map((e) => ({
          rule: 'deprecated-needs-sunset',
          version: e.version,
          message: `deprecated version '${e.version}' has no sunset date`,
          severity: 'warning' as const,
        })),
  },
];

export class VersionCompliance {
  private readonly _rules: ReadonlyArray<ComplianceRule>;

  constructor(rules: ReadonlyArray<ComplianceRule> = COMPLIANCE_RULES) {
    this._rules = rules;
  }

  check(matrix: VersionMatrix): ComplianceViolation[] {
    const entries = matrix.versions().map((v) => matrix.get(v) as VersionEntry);
    const out: ComplianceViolation[] = [];
    for (const rule of this._rules) {
      out.push(...rule.check(entries));
    }
    return out;
  }
}
