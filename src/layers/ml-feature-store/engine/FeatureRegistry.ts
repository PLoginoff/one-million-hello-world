/**
 * Feature Registry
 *
 * Catalog of feature definitions with versioning and lifecycle
 * (draft → active → deprecated → retired). The registry is the
 * authoritative answer to "what does feature X mean, who owns it, and
 * is it safe to use in a new model?"
 *
 * Semantics:
 *   - Registering the same feature name bumps `version` when the schema
 *     changes (type/ttl/default/tags), or is a no-op when identical.
 *   - Deprecation warns but still serves; retirement removes.
 *   - `validateSet` checks a batch of writes against the registry so
 *     bad data is rejected at the boundary, not at query time.
 *
 * @module MlFeatureStoreLayer/Engine
 */

import { FeatureDefinition, FeatureValue, validateValue } from './FeatureStore';
import { IClock, SystemClock } from '../../observability/engine/signals';

export type FeatureLifecycle = 'draft' | 'active' | 'deprecated' | 'retired';

export interface RegisteredFeature extends FeatureDefinition {
  readonly version: number;
  readonly lifecycle: FeatureLifecycle;
  readonly registeredAtMs: number;
  readonly deprecatedAtMs?: number;
}

export class FeatureRegistry {
  private readonly _features = new Map<string, RegisteredFeature>();
  private readonly _history = new Map<string, RegisteredFeature[]>();
  private readonly _clock: IClock;

  constructor(clock: IClock = new SystemClock()) {
    this._clock = clock;
  }

  /**
   * Register or update a feature. Identical re-registration is a no-op;
   * a schema change bumps the version and records history.
   */
  register(def: FeatureDefinition): RegisteredFeature {
    const existing = this._features.get(def.name);
    if (existing && this._sameShape(existing, def)) return existing;
    const prev = existing ? [...(this._history.get(def.name) ?? []), existing] : [];
    if (existing) this._history.set(def.name, prev);
    const entry: RegisteredFeature = {
      ...def,
      version: (existing?.version ?? 0) + 1,
      lifecycle: existing?.lifecycle === 'deprecated' ? 'deprecated' : 'active',
      registeredAtMs: this._clock.nowMs(),
      deprecatedAtMs: existing?.deprecatedAtMs,
    };
    this._features.set(def.name, entry);
    return entry;
  }

  private _sameShape(a: FeatureDefinition, b: FeatureDefinition): boolean {
    return (
      a.type === b.type &&
      a.ttlMs === b.ttlMs &&
      a.owner === b.owner &&
      a.defaultValue === b.defaultValue &&
      JSON.stringify([...(a.tags ?? [])].sort()) === JSON.stringify([...(b.tags ?? [])].sort())
    );
  }

  /** Deprecate — still served, but `isUsable` returns 'deprecated'. */
  deprecate(name: string): RegisteredFeature {
    const f = this._features.get(name);
    if (!f) throw new FeatureRegistryError(`unknown feature ${name}`);
    const next: RegisteredFeature = { ...f, lifecycle: 'deprecated', deprecatedAtMs: this._clock.nowMs() };
    this._features.set(name, next);
    return next;
  }

  /** Retire — removed from the active catalog. */
  retire(name: string): void {
    const f = this._features.get(name);
    if (!f) throw new FeatureRegistryError(`unknown feature ${name}`);
    const hist = this._history.get(name) ?? [];
    this._history.set(name, [...hist, { ...f, lifecycle: 'retired' }]);
    this._features.delete(name);
  }

  get(name: string): RegisteredFeature | undefined {
    return this._features.get(name);
  }

  /**
   * Usability gate for training/serving: 'ok' | 'deprecated' | 'retired' | 'missing'.
   */
  status(name: string): 'ok' | 'deprecated' | 'retired' | 'missing' | 'draft' {
    const f = this._features.get(name);
    if (!f) return this._history.has(name) ? 'retired' : 'missing';
    return f.lifecycle === 'active' ? 'ok' : f.lifecycle;
  }

  /**
   * Validate a batch of feature writes against the registry. Returns the
   * list of per-feature errors (empty = clean). Non-registered features
   * are reported as warnings, not errors — the online store tolerates
   * unregistered writes.
   */
  validateSet(
    values: Record<string, FeatureValue>
  ): Array<{ feature: string; error: string }> {
    const errors: Array<{ feature: string; error: string }> = [];
    for (const [name, v] of Object.entries(values)) {
      const def = this._features.get(name);
      if (!def) {
        errors.push({ feature: name, error: 'unregistered feature' });
        continue;
      }
      if (def.lifecycle === 'retired') {
        errors.push({ feature: name, error: 'feature is retired' });
        continue;
      }
      if (!validateValue(def, v)) {
        errors.push({ feature: name, error: `type mismatch: expected ${def.type}` });
      }
    }
    return errors;
  }

  /** All active + deprecated features. */
  catalog(): RegisteredFeature[] {
    return [...this._features.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Version history for a feature, oldest → newest. */
  history(name: string): ReadonlyArray<RegisteredFeature> {
    return this._history.get(name) ?? [];
  }

  /** Features owned by a team (governance reports). */
  byOwner(owner: string): RegisteredFeature[] {
    return this.catalog().filter((f) => f.owner === owner);
  }
}

export class FeatureRegistryError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'FeatureRegistryError';
  }
}
