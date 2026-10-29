/**
 * API Versioning — Semantic Versioning
 *
 * Full semver 2.0.0 parsing + comparison, including the part most
 * implementations get wrong: prerelease ordering.
 *
 * Prerelease rules (semver.org §11):
 *   - A version with a prerelease is LOWER than the same version without:
 *     `1.0.0-alpha < 1.0.0`.
 *   - Identifiers compare left-to-right: numeric identifiers compare
 *     numerically and always sort below alphanumeric ones;
 *     `1.0.0-alpha.1 < 1.0.0-alpha.beta` (numeric 1 < alpha identifier).
 *   - A larger identifier set wins when one is a prefix of the other:
 *     `1.0.0-alpha < 1.0.0-alpha.1`.
 *   - Build metadata (`+sha`) is ignored for ordering but preserved in
 *     parsing.
 *
 * Also includes a pragmatic `satisfies` range matcher covering the subset
 * API versioning needs: exact, `x`-wildcards, `^`, `~`, and comparison
 * conjunctions (`>=1.0.0 <2.0.0`).
 *
 * @module ApiVersioning/Negotiation
 */

const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export class SemVerParseError extends Error {
  constructor(input: string) {
    super(`invalid semver '${input}'`);
    this.name = 'SemVerParseError';
  }
}

/** Immutable parsed semver. */
export class SemVer {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: ReadonlyArray<string>;
  readonly build: string | undefined;

  private constructor(major: number, minor: number, patch: number, prerelease: string[], build?: string) {
    this.major = major;
    this.minor = minor;
    this.patch = patch;
    this.prerelease = Object.freeze(prerelease.slice());
    this.build = build;
  }

  static parse(input: string): SemVer {
    const m = SEMVER_RE.exec(input.trim());
    if (!m) throw new SemVerParseError(input);
    const prerelease = m[4] !== undefined ? m[4].split('.') : [];
    return new SemVer(Number(m[1]), Number(m[2]), Number(m[3]), prerelease, m[5]);
  }

  /** Lenient parse — accepts `v1.2.3`, `1.2`, `2` (missing parts = 0). */
  static coerce(input: string): SemVer | undefined {
    const t = input.trim().replace(/^v/i, '');
    const mainParts = t.split('.');
    if (mainParts.length === 0 || mainParts.length > 3) return undefined;
    // Keep prerelease/build suffixes attached to the last segment.
    const padded = [...mainParts, '0', '0'].slice(0, 3);
    try {
      return SemVer.parse(padded.join('.'));
    } catch {
      return undefined;
    }
  }

  static isValid(input: string): boolean {
    return SEMVER_RE.test(input.trim());
  }

  /** -1 / 0 / +1 ordering per semver §11. Build metadata ignored. */
  compare(other: SemVer): number {
    if (this.major !== other.major) return this.major < other.major ? -1 : 1;
    if (this.minor !== other.minor) return this.minor < other.minor ? -1 : 1;
    if (this.patch !== other.patch) return this.patch < other.patch ? -1 : 1;
    return SemVer.comparePrerelease(this.prerelease, other.prerelease);
  }

  equals(other: SemVer): boolean {
    return this.compare(other) === 0;
  }

  lt(other: SemVer): boolean {
    return this.compare(other) < 0;
  }

  lte(other: SemVer): boolean {
    return this.compare(other) <= 0;
  }

  gt(other: SemVer): boolean {
    return this.compare(other) > 0;
  }

  gte(other: SemVer): boolean {
    return this.compare(other) >= 0;
  }

  toString(): string {
    let s = `${this.major}.${this.minor}.${this.patch}`;
    if (this.prerelease.length > 0) s += `-${this.prerelease.join('.')}`;
    if (this.build !== undefined) s += `+${this.build}`;
    return s;
  }

  /** Prerelease ordering — see module docs for the rules encoded here. */
  private static comparePrerelease(a: ReadonlyArray<string>, b: ReadonlyArray<string>): number {
    // No prerelease sorts higher than any prerelease.
    if (a.length === 0 && b.length === 0) return 0;
    if (a.length === 0) return 1;
    if (b.length === 0) return -1;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const r = compareIdentifier(a[i], b[i]);
      if (r !== 0) return r;
    }
    // Prefix rule: more identifiers = higher precedence.
    if (a.length !== b.length) return a.length < b.length ? -1 : 1;
    return 0;
  }
}

function isNumericId(s: string): boolean {
  return /^\d+$/.test(s);
}

/** Semver §11.4 identifier comparison: numeric < alphanumeric. */
function compareIdentifier(a: string, b: string): number {
  const an = isNumericId(a);
  const bn = isNumericId(b);
  if (an && bn) {
    const d = BigInt(a) - BigInt(b);
    return d < 0n ? -1 : d > 0n ? 1 : 0;
  }
  if (an) return -1;
  if (bn) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Sort helper for arrays of version strings (invalid strings sort last). */
export function sortVersions(versions: ReadonlyArray<string>, descending = false): string[] {
  const parsed = versions.map((v) => {
    let sv: SemVer | null = null;
    try {
      sv = SemVer.coerce(v) ?? SemVer.parse(v);
    } catch {
      sv = null;
    }
    return { raw: v, sv };
  });
  parsed.sort((x, y) => {
    if (x.sv === null && y.sv === null) return 0;
    if (x.sv === null) return 1;
    if (y.sv === null) return -1;
    return x.sv.compare(y.sv);
  });
  if (descending) parsed.reverse();
  return parsed.map((p) => p.raw);
}

/**
 * Range satisfaction — a pragmatic subset of npm's range grammar covering
 * what API versioning needs:
 *
 *   `1.2.3`          exact
 *   `1.2.x`, `1.x`   prefix wildcards (`*` too)
 *   `^1.2.3`         >=1.2.3 <2.0.0 (compatible)
 *   `~1.2.3`         >=1.2.3 <1.3.0 (patch-level)
 *   `>=1.0.0 <2.0.0` space-separated comparison conjunction
 */
export function satisfies(version: SemVer, range: string): boolean {
  const r = range.trim();
  if (r === '' || r === '*') return true;
  const clauses = r.split(/\s+/).filter((c) => c.length > 0);
  return clauses.every((clause) => satisfiesClause(version, clause));
}

function satisfiesClause(version: SemVer, clause: string): boolean {
  if (clause === '*' || clause === 'x') return true;

  // Comparison operators.
  const cmp = /^(>=|<=|>|<)(.+)$/.exec(clause);
  if (cmp) {
    const bound = SemVer.coerce(cmp[2]);
    if (!bound) return false;
    switch (cmp[1]) {
      case '>=':
        return version.gte(bound);
      case '<=':
        return version.lte(bound);
      case '>':
        return version.gt(bound);
      case '<':
        return version.lt(bound);
    }
  }

  // Caret: compatible-within-major (0.x special-cased per semver convention:
  // ^0.2.3 → >=0.2.3 <0.3.0, ^0.0.3 → >=0.0.3 <0.0.4).
  if (clause.startsWith('^')) {
    const base = SemVer.coerce(clause.slice(1));
    if (!base) return false;
    if (version.lt(base)) return false;
    if (base.major > 0) return version.major === base.major;
    if (base.minor > 0) return version.major === 0 && version.minor === base.minor;
    return version.major === 0 && version.minor === 0 && version.patch === base.patch;
  }

  // Tilde: patch-level changes.
  if (clause.startsWith('~')) {
    const base = SemVer.coerce(clause.slice(1));
    if (!base) return false;
    return version.gte(base) && version.major === base.major && version.minor === base.minor;
  }

  // Wildcard / exact.
  const wc = /^(\d+|x|\*)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?$/.exec(clause);
  if (wc) {
    const seg = (s: string | undefined): number | 'x' | undefined => {
      if (s === undefined) return undefined;
      if (s === 'x' || s === '*') return 'x';
      return Number(s);
    };
    const [maj, min, pat] = [seg(wc[1]), seg(wc[2]), seg(wc[3])];
    if (maj === 'x' || maj === undefined) return true;
    if (version.major !== maj) return false;
    if (min === 'x' || min === undefined) return true;
    if (version.minor !== min) return false;
    if (pat === 'x' || pat === undefined) return true;
    return version.patch === pat;
  }

  // Plain version string (possibly with prerelease).
  const exact = SemVer.coerce(clause);
  if (!exact) return false;
  return version.equals(exact);
}
