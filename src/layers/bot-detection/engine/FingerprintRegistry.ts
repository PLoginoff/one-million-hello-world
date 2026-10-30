/**
 * FingerprintRegistry — per-user device-fingerprint drift detection.
 *
 * Browsers leak dozens of semi-stable attributes (canvas hash, UA,
 * timezone, installed fonts, screen size). A *legitimate* user's
 * fingerprint is mostly constant — it changes on OS updates or new
 * hardware, i.e. slowly. Credential-stuffers cycling emulators
 * produce a different fingerprint per login; a botnet farm
 * replaying a stolen session produces *impossible travel* between
 * fingerprints.
 *
 * The registry keeps, per user:
 *   - the established fingerprint (mode of each component over
 *     history), and
 *   - the list of observed fingerprints.
 *
 * `observe()` compares the new fingerprint to the established one:
 * `changed` components / total = drift score. A few components
 * differing (one font, one plugin) is normal (<20% → low). A
 * wholesale swap (canvas+ua+screen all different) is near-1.
 *
 * Established fingerprint is recomputed lazily as component-wise
 * majority — resistant to occasional drift, tightens over time.
 *
 * @module BotDetectionLayer/Engine
 */

import { DriftAssessment, Fingerprint } from './types';

export interface FingerprintOptions {
  /**
   * Observations before the established fingerprint is considered
   * stable. Default 3.
   */
  readonly stabilizationCount?: number;
  /** Components with this weight count double (canvas, webgl). */
  readonly heavyComponents?: readonly string[];
}

interface UserRecord {
  observations: Fingerprint[];
  established: Record<string, string> | null;
}

export class FingerprintRegistry {
  private readonly _stabilization: number;
  private readonly _heavy: ReadonlySet<string>;
  private readonly _users: Map<string, UserRecord>;

  constructor(options: FingerprintOptions = {}) {
    this._stabilization = options.stabilizationCount ?? 3;
    this._heavy = new Set(options.heavyComponents ?? []);
    this._users = new Map();
  }

  /**
   * Record a fingerprint for a user and score its drift against the
   * established fingerprint.
   */
  observe(userId: string, fp: Fingerprint): DriftAssessment {
    let rec = this._users.get(userId);
    if (rec === undefined) {
      rec = { observations: [], established: null };
      this._users.set(userId, rec);
    }
    rec.observations.push(fp);

    const changed: string[] = [];
    let score = 0;

    if (rec.established !== null) {
      // Drift = weighted share of differing components.
      let weight = 0;
      let changedWeight = 0;
      for (const [k, v] of Object.entries(fp.components)) {
        const w = this._heavy.has(k) ? 2 : 1;
        weight += w;
        if (rec.established[k] !== v) {
          changedWeight += w;
          changed.push(k);
        }
      }
      score = weight > 0 ? changedWeight / weight : 0;
    } else {
      // Not yet established — first observations are neutral.
      score = rec.observations.length >= this._stabilization ? 0.2 : 0;
    }

    // Recompute established fingerprint once enough observations.
    if (rec.observations.length >= this._stabilization) {
      rec.established = majorityFingerprint(rec.observations);
    }

    return {
      score,
      changed,
      observations: rec.observations.length,
    };
  }

  /** The established fingerprint for a user, if stabilized. */
  established(userId: string): Readonly<Record<string, string> | null> {
    return this._users.get(userId)?.established ?? null;
  }

  /** Distinct fingerprints seen for a user. */
  fingerprintCount(userId: string): number {
    const rec = this._users.get(userId);
    if (rec === undefined) return 0;
    const set = new Set<string>();
    for (const fp of rec.observations) {
      set.add(
        Object.keys(fp.components)
          .sort()
          .map((k) => `${k}=${fp.components[k]}`)
          .join('|')
      );
    }
    return set.size;
  }

  get userCount(): number {
    return this._users.size;
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Component-wise majority vote across observations. */
function majorityFingerprint(
  observations: readonly Fingerprint[]
): Record<string, string> {
  const votes = new Map<string, Map<string, number>>();
  for (const fp of observations) {
    for (const [k, v] of Object.entries(fp.components)) {
      let m = votes.get(k);
      if (m === undefined) {
        m = new Map();
        votes.set(k, m);
      }
      m.set(v, (m.get(v) ?? 0) + 1);
    }
  }
  const out: Record<string, string> = {};
  for (const [k, m] of votes) {
    let best = '';
    let bestN = -1;
    for (const [v, n] of m) {
      if (n > bestN) {
        bestN = n;
        best = v;
      }
    }
    out[k] = best;
  }
  return out;
}
