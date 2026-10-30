/**
 * Feature Set Composer — versioned training/inference feature sets.
 *
 * A *feature set* is a named, versioned bundle of features drawn from
 * registered feature views — the unit a model pins to ("churn-v3 uses
 * set user-features@3"). The composer resolves view membership into a
 * flat schema, fingerprints it, and can diff two sets for
 * compatibility (a model trained on set A can only score on set B if
 * B is a backward-compatible extension of A).
 *
 * @module MlFeatureStoreLayer/Engine2
 */

import { FeatureDefinition, FeatureView } from '../engine/FeatureStore';

export interface FeatureSet {
  readonly name: string;
  readonly version: number;
  /** feature name → definition (flat, deduplicated by name). */
  readonly features: Readonly<Record<string, FeatureDefinition>>;
  /** Views this set was composed from. */
  readonly sourceViews: ReadonlyArray<string>;
  /** Content hash of the canonical schema — cheap compat check. */
  readonly fingerprint: string;
  readonly createdAtMs: number;
}

export type CompatVerdict =
  | 'identical'       // same fingerprint
  | 'compatible'      // new set only *adds* features
  | 'breaking'        // removed or type-changed features
  | 'unknown-set';

export interface CompatReport {
  readonly verdict: CompatVerdict;
  readonly added: ReadonlyArray<string>;
  readonly removed: ReadonlyArray<string>;
  readonly typeChanged: ReadonlyArray<string>;
}

/** fnv-1a over the canonical schema string. */
function fingerprint(features: Readonly<Record<string, FeatureDefinition>>): string {
  const canonical = Object.keys(features)
    .sort()
    .map((k) => `${k}:${features[k].type}:${features[k].owner}`)
    .join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    h ^= canonical.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export class FeatureSetComposer {
  private readonly _views = new Map<string, FeatureView>();
  /** "name@version" → set. */
  private readonly _sets = new Map<string, FeatureSet>();
  /** name → highest version registered. */
  private readonly _latest = new Map<string, number>();
  private _seq = 0;

  constructor(private readonly _clock: () => number = () => Date.now()) {}

  registerView(view: FeatureView): void {
    this._views.set(view.name, view);
  }

  /**
   * Compose a set from named views. Feature name collisions resolve
   * last-view-wins (callers should order views by precedence).
   * Auto-increments the version per set name.
   */
  compose(name: string, viewNames: ReadonlyArray<string>): FeatureSet {
    const features: Record<string, FeatureDefinition> = {};
    for (const vn of viewNames) {
      const view = this._views.get(vn);
      if (!view) throw new Error(`unknown feature view "${vn}"`);
      for (const f of view.features) features[f.name] = f;
    }
    const version = (this._latest.get(name) ?? 0) + 1;
    this._latest.set(name, version);
    this._seq += 1;
    const set: FeatureSet = {
      name,
      version,
      features,
      sourceViews: [...viewNames],
      fingerprint: fingerprint(features),
      createdAtMs: this._clock(),
    };
    this._sets.set(`${name}@${version}`, set);
    return set;
  }

  get(name: string, version?: number): FeatureSet | undefined {
    const v = version ?? this._latest.get(name);
    if (v === undefined) return undefined;
    return this._sets.get(`${name}@${v}`);
  }

  /**
   * Is `candidate` safe to serve a model trained on `base`?
   * compatible = candidate adds features but removes/changes none.
   */
  checkCompatibility(base: FeatureSet | undefined, candidate: FeatureSet): CompatReport {
    if (!base) {
      return { verdict: 'unknown-set', added: Object.keys(candidate.features), removed: [], typeChanged: [] };
    }
    if (base.fingerprint === candidate.fingerprint) {
      return { verdict: 'identical', added: [], removed: [], typeChanged: [] };
    }
    const added: string[] = [];
    const removed: string[] = [];
    const typeChanged: string[] = [];
    for (const k of Object.keys(candidate.features)) {
      if (!(k in base.features)) added.push(k);
      else if (candidate.features[k].type !== base.features[k].type) typeChanged.push(k);
    }
    for (const k of Object.keys(base.features)) {
      if (!(k in candidate.features)) removed.push(k);
    }
    const verdict: CompatVerdict =
      removed.length > 0 || typeChanged.length > 0 ? 'breaking' : 'compatible';
    return { verdict, added, removed, typeChanged };
  }

  /** Schema listing for a set — "name: type" sorted. */
  describe(set: FeatureSet): string[] {
    return Object.keys(set.features)
      .sort()
      .map((k) => `${k}: ${set.features[k].type}`);
  }
}
