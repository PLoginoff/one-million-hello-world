/**
 * Secret Drift Detector — the values-changed-but-structure-same class.
 *
 * Regular drift detection reports "spec.data changed" for a Secret
 * resource — technically true, practically useless: it can't tell a
 * routine key *rotation* (value changed, key set identical — expected,
 * often healthy) from a *structural* drift (keys added/removed —
 * suspicious) or a tamper.
 *
 * This detector inspects secret-shaped resources (kind containing
 * "Secret" or spec.data/spec.stringData maps) and classifies value churn:
 *
 *   rotatedKeys — same key, new value. Typically a rotation. Report but
 *     don't alarm: a key that never rotates is *more* suspicious.
 *   addedKeys   — key present only in desired. Means git added it; live
 *     lacking it is ordinary drift.
 *   removedKeys — key present only in live. Someone injected a key
 *     out-of-band — the highest-severity finding here.
 *
 * It also flags *suspiciously stable* secrets: a key whose value hasn't
 * changed across N observations may be a long-lived credential that
 * policy expects to rotate.
 *
 * Complexity: O(total secret keys across resources) per scan.
 *
 * @module GitopsLayer/Engine2
 */

import { DesiredRevision, ResourceSpec, resourceKey } from '../engines/types';
import { LiveStore } from '../engines/types';
import { SecretDrift } from './types';

/** Marks a resource as secret-bearing. */
function isSecretLike(r: ResourceSpec): boolean {
  return /secret/i.test(r.kind) || 'data' in r.spec || 'stringData' in r.spec;
}

export class SecretDriftDetector {
  private readonly _live: LiveStore;
  /** key → value-hash seen last scan, for rotation-cadence tracking. */
  private readonly _lastValues = new Map<string, Map<string, unknown>>();
  /** key → scans since last rotation. */
  private readonly _stableScans = new Map<string, Map<string, number>>();

  constructor(live: LiveStore) {
    this._live = live;
  }

  /**
   * Compare desired vs live for every secret-like resource.
   * Values are compared by deep-equal (secrets may be nested objects),
   * never logged — only key names leak into reports.
   */
  detect(revision: DesiredRevision): SecretDrift[] {
    const out: SecretDrift[] = [];
    for (const [key, desired] of revision.resources) {
      if (!isSecretLike(desired)) continue;
      const live = this._live.get(key);
      if (!live) continue; // create — handled by ordinary drift

      const dData = this._secretData(desired);
      const lData = this._secretData(live);
      const rotated: string[] = [];
      const added: string[] = [];
      const removed: string[] = [];

      for (const [k, dv] of dData) {
        if (!lData.has(k)) {
          added.push(k);
        } else if (!this._eq(dv, lData.get(k))) {
          rotated.push(k);
        }
      }
      for (const k of lData.keys()) {
        if (!dData.has(k)) removed.push(k);
      }
      if (rotated.length || added.length || removed.length) {
        out.push({ resourceKey: key, rotatedKeys: rotated.sort(), addedKeys: added.sort(), removedKeys: removed.sort() });
      }
    }
    return out;
  }

  /**
   * Track rotation cadence: feed the live secret's current values each
   * scan; returns keys whose value hasn't changed for `staleScans`+
   * consecutive scans — long-lived credential candidates.
   */
  staleness(liveKeys: readonly string[], staleScans = 5): { resourceKey: string; staleKeys: string[] }[] {
    const out: { resourceKey: string; staleKeys: string[] }[] = [];
    for (const resKey of liveKeys) {
      const live = this._live.get(resKey);
      if (!live || !isSecretLike(live)) continue;
      const data = this._secretData(live);
      const last = this._lastValues.get(resKey) ?? new Map<string, unknown>();
      const stable = this._stableScans.get(resKey) ?? new Map<string, number>();
      const staleKeys: string[] = [];

      for (const [k, v] of data) {
        const prev = last.get(k);
        if (prev !== undefined && this._eq(prev, v)) {
          const n = (stable.get(k) ?? 0) + 1;
          stable.set(k, n);
          if (n >= staleScans) staleKeys.push(k);
        } else {
          stable.set(k, 0); // rotated — counter resets
        }
      }
      this._lastValues.set(resKey, new Map(data));
      this._stableScans.set(resKey, stable);
      if (staleKeys.length > 0) out.push({ resourceKey: resKey, staleKeys: staleKeys.sort() });
    }
    return out;
  }

  /* ---------------------------------------------------------------- */

  /** Extract the secret payload map from a resource's spec. */
  private _secretData(r: ResourceSpec): Map<string, unknown> {
    const out = new Map<string, unknown>();
    for (const field of ['data', 'stringData'] as const) {
      const v = r.spec[field];
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
          out.set(k, val);
        }
      }
    }
    return out;
  }

  private _eq(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (typeof a === 'object' && a !== null && b !== null) {
      // Cheap deep-equal for small secret values.
      return JSON.stringify(a) === JSON.stringify(b);
    }
    return false;
  }
}
