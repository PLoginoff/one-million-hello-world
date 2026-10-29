/**
 * API Versioning — Version Matrix + Extraction Types
 *
 * The VersionMatrix is the registry of which API versions exist and where
 * each sits in its lifecycle:
 *
 *   BETA ──► SUPPORTED ──► DEPRECATED ──► SUNSET
 *                (dates decide transitions; status field declares intent)
 *
 * - `beta`: public but unstable — clients get `Warning` headers.
 * - `supported`: fully live.
 * - `deprecated`: still served, emits `Deprecation` + `Sunset` headers.
 * - `sunset`: after `sunsetAt`, requests are rejected with HTTP 410
 *   semantics (the router surfaces `sunset: true` so the adapter can
 *   produce the right status).
 *
 * Versions are keyed by their canonical string (`1.2.3` or a label like
 * `v2`) — negotiation resolves labels → SemVer where possible but the
 * matrix doesn't *require* semver (legacy versions like `2015-10-01`
 * are supported as plain labels).
 *
 * @module ApiVersioning/Negotiation
 */

import { SemVer } from './SemVer';

/** Injectable clock — epoch ms. */
export type VersionClock = () => number;

export enum VersionStatus {
  BETA = 'beta',
  SUPPORTED = 'supported',
  DEPRECATED = 'deprecated',
  SUNSET = 'sunset',
}

export interface VersionEntry {
  /** Canonical version string — '1.0.0', 'v2', '2024-01'. */
  readonly version: string;
  readonly status: VersionStatus;
  /** When the version was introduced (epoch ms). */
  readonly introducedAt?: number;
  /** When deprecation was announced. */
  readonly deprecatedAt?: number;
  /** Hard sunset — requests after this are rejected (410). */
  readonly sunsetAt?: number;
  /** Replacement version to point clients at. */
  readonly successor?: string;
  /** Migration guide URI (Link header target). */
  readonly migrationGuideUrl?: string;
  /** Freeform release notes. */
  readonly notes?: string;
}

export type VersionLifecycle =
  | 'beta'
  | 'supported'
  | 'deprecated'
  | 'sunset-pending' // announced sunset, not yet reached
  | 'sunset'         // past sunsetAt — reject
  | 'unknown';

export interface VersionResolution {
  readonly version: string;
  readonly lifecycle: VersionLifecycle;
  readonly entry: VersionEntry | undefined;
  /** True when requests must be rejected (past sunset). */
  readonly sunset: boolean;
}

export class VersionMatrix {
  private readonly _entries = new Map<string, VersionEntry>();
  private readonly _clock: VersionClock;

  constructor(clock: VersionClock = Date.now) {
    this._clock = clock;
  }

  register(entry: VersionEntry): void {
    this._entries.set(entry.version, entry);
  }

  unregister(version: string): boolean {
    return this._entries.delete(version);
  }

  get(version: string): VersionEntry | undefined {
    return this._entries.get(version);
  }

  versions(): ReadonlyArray<string> {
    return Array.from(this._entries.keys());
  }

  /**
   * Resolve the effective lifecycle of `version` right now. A DEPRECATED
   * entry with `sunsetAt` in the future is 'sunset-pending'; past → 'sunset'.
   * Unknown versions resolve 'unknown' (the router decides whether unknowns
   * fall back or 400).
   */
  resolve(version: string, now?: number): VersionResolution {
    const entry = this._entries.get(version);
    if (!entry) {
      return { version, lifecycle: 'unknown', entry: undefined, sunset: false };
    }
    const t = now ?? this._clock();
    const pastSunset = entry.sunsetAt !== undefined && t >= entry.sunsetAt;
    let lifecycle: VersionLifecycle;
    if (pastSunset) {
      lifecycle = 'sunset';
    } else if (entry.status === VersionStatus.SUNSET || (entry.status === VersionStatus.DEPRECATED && entry.sunsetAt !== undefined)) {
      lifecycle = 'sunset-pending';
    } else if (entry.status === VersionStatus.DEPRECATED) {
      lifecycle = 'deprecated';
    } else if (entry.status === VersionStatus.BETA) {
      lifecycle = 'beta';
    } else {
      lifecycle = 'supported';
    }
    return { version, lifecycle, entry, sunset: pastSunset };
  }

  /**
   * The newest supported-or-beta version — the negotiation fallback when a
   * client doesn't specify one. Semver-parseable versions sort by semver;
   * unparseable labels sort by `introducedAt` then lexically.
   */
  latest(now?: number): string | undefined {
    const t = now ?? this._clock();
    // Stable versions always outrank pre-release ones for "the default".
    const rank = (l: VersionLifecycle): number => {
      switch (l) {
        case 'supported': return 3;
        case 'deprecated':
        case 'sunset-pending': return 2;
        case 'beta': return 1;
        default: return 0;
      }
    };
    const candidates = Array.from(this._entries.values())
      .map((e) => ({ e, res: this.resolve(e.version, t) }))
      .filter((c) => rank(c.res.lifecycle) > 0);
    if (candidates.length === 0) return undefined;

    const scored = candidates.map((c) => {
      let sv: SemVer | null = null;
      try {
        sv = SemVer.coerce(c.e.version) ?? SemVer.parse(c.e.version);
      } catch {
        sv = null;
      }
      return { e: c.e, sv, rank: rank(c.res.lifecycle) };
    });
    scored.sort((a, b) => {
      if (a.rank !== b.rank) return b.rank - a.rank; // stable > deprecated > beta
      if (a.sv && b.sv) return b.sv.compare(a.sv);
      if (a.sv) return -1;
      if (b.sv) return 1;
      const ai = a.e.introducedAt ?? 0;
      const bi = b.e.introducedAt ?? 0;
      if (ai !== bi) return bi - ai;
      return b.e.version.localeCompare(a.e.version);
    });
    return scored[0].e.version;
  }

  /** Versions that need Deprecation headers right now. */
  deprecated(now?: number): ReadonlyArray<VersionEntry> {
    const t = now ?? this._clock();
    return Array.from(this._entries.values()).filter((e) => {
      const l = this.resolve(e.version, t).lifecycle;
      return l === 'deprecated' || l === 'sunset-pending';
    });
  }
}
