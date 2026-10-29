/**
 * Configuration Engine — Orchestrator
 *
 * Ties the pieces together:
 *
 *   sources ──load()──► layers ──merge──► interpolate ──validate──► effective
 *                                        │ on failure: keep previous (rollback)
 *                                        ▼
 *                                   diff → listeners → snapshot
 *
 * Responsibilities
 * ----------------
 * - `registerSource` / `addLayer`: static layers and pollable sources.
 * - `reload()`: pull every source, merge in precedence order, run `${ref}`
 *   interpolation over the flat map, then validate against the schema. A
 *   failed validation ROLLS BACK — the previous effective config stays live,
 *   listeners are NOT notified, and the violations are returned/thrown.
 * - Change detection: every successful reload diffs old vs new effective
 *   config; listeners fire only when `diff.changed`.
 * - Scoped listeners via `onChange(prefix, listener)` — a listener under
 *   `database` only sees diffs under `database.*`.
 * - `freeze()`: immutable snapshot of the current effective config (deep
 *   frozen). Mutating a frozen engine throws `FrozenConfigError`.
 * - Per-environment overrides: layers declare `environments`; the merger
 *   filters by the engine's active environment.
 *
 * All timing flows through the injected clock; reload is async because
 * sources may be.
 *
 * @module Configuration/Engine
 */

import {
  ConfigChangeListener,
  ConfigClock,
  ConfigDiff,
  ConfigLayer,
  ConfigObject,
  ConfigPrecedence,
  ConfigSnapshot,
  ConfigSource,
  ConfigValue,
  EffectiveConfig,
  SchemaRule,
  SchemaViolation,
  isConfigObject,
} from './ConfigTypes';
import { ConfigMerger, MergedConfig, deepMerge, flattenTree, setPath, deletePath, getPath, splitPath } from './ConfigMerger';
import { SecretMasker } from './SecretMasker';
import { ConfigInterpolator } from './ConfigInterpolator';
import { ConfigSchema } from './ConfigSchema';
import { ConfigDiffEngine } from './ConfigDiffEngine';

export class FrozenConfigError extends Error {
  constructor(op: string) {
    super(`config engine is frozen — '${op}' is not allowed`);
    this.name = 'FrozenConfigError';
  }
}

export class ConfigValidationError extends Error {
  readonly violations: ReadonlyArray<SchemaViolation>;
  constructor(violations: ReadonlyArray<SchemaViolation>) {
    super(`config validation failed (${violations.length} violation(s)): ${violations.map((v) => `${v.path}: ${v.message}`).join('; ')}`);
    this.name = 'ConfigValidationError';
    this.violations = violations;
  }
}

export interface ReloadResult {
  readonly applied: boolean;
  readonly rolledBack: boolean;
  readonly diff: ConfigDiff;
  readonly violations: ReadonlyArray<SchemaViolation>;
  readonly unresolvedRefs: ReadonlyArray<string>;
}

interface ScopedListener {
  readonly prefix: string | undefined;
  readonly listener: ConfigChangeListener;
}

export interface ConfigEngineOptions {
  /** Active environment name, e.g. 'production' (default 'development'). */
  readonly environment?: string;
  /** Secret path patterns for output masking. */
  readonly secretPatterns?: ReadonlyArray<string>;
  /** Schema rules applied on every reload. */
  readonly rules?: ReadonlyArray<SchemaRule>;
  /** Throw on validation failure instead of silently rolling back. */
  readonly strictValidation?: boolean;
  /** Clock injection. */
  readonly clock?: ConfigClock;
}

export class ConfigEngine {
  private readonly _clock: ConfigClock;
  private readonly _environment: string;
  private readonly _strict: boolean;
  private readonly _masker: SecretMasker;
  private readonly _schema: ConfigSchema;
  private readonly _diffEngine = new ConfigDiffEngine();
  private readonly _interpolator: ConfigInterpolator;

  private _staticLayers: ConfigLayer[] = [];
  private _sources: ConfigSource[] = [];
  private _listeners: ScopedListener[] = [];
  private _effective: EffectiveConfig | null = null;
  private _frozen = false;
  private _snapshots: ConfigSnapshot[] = [];
  private _unresolvedRefs: string[] = [];
  private _lastDiff: ConfigDiff = { changes: [], at: 0, changed: false };

  constructor(options: ConfigEngineOptions = {}) {
    this._clock = options.clock ?? Date.now;
    this._environment = options.environment ?? 'development';
    this._strict = options.strictValidation ?? false;
    this._masker = new SecretMasker(options.secretPatterns ?? []);
    this._schema = new ConfigSchema(options.rules ?? []);
    this._interpolator = new ConfigInterpolator({
      onUnresolved: (path, placeholder) => {
        this._unresolvedRefs.push(`${path}: ${placeholder}`);
      },
    });
  }

  get environment(): string {
    return this._environment;
  }

  get isFrozen(): boolean {
    return this._frozen;
  }

  get masker(): SecretMasker {
    return this._masker;
  }

  get schema(): ConfigSchema {
    return this._schema;
  }

  /** The live effective config; throws when never loaded. */
  get effective(): EffectiveConfig {
    if (this._effective === null) {
      throw new Error('config engine has not been loaded — call reload() first');
    }
    return this._effective;
  }

  get lastDiff(): ConfigDiff {
    return this._lastDiff;
  }

  // ------------------------------------------------------------- registration

  /** Register a pollable source (env, remote, file watchers). */
  registerSource(source: ConfigSource): void {
    this._assertMutable('registerSource');
    this._sources.push(source);
  }

  /**
   * Add a static (in-code) layer at a given precedence — e.g. defaults, or an
   * already-parsed file/env map.
   */
  addLayer(name: string, precedence: ConfigPrecedence, entries: Readonly<Record<string, ConfigValue>>, environments?: ReadonlyArray<string>): void {
    this._assertMutable('addLayer');
    this._staticLayers.push({ name, precedence, entries, ...(environments ? { environments } : {}) });
  }

  /**
   * Convenience: add a *nested object* layer — `{a: {b: 1}}` is flattened to
   * `a.b = 1` automatically.
   */
  addObjectLayer(name: string, precedence: ConfigPrecedence, obj: ConfigObject, environments?: ReadonlyArray<string>): void {
    this.addLayer(name, precedence, flattenTree(obj), environments);
  }

  /** Register a secret path pattern (e.g. `**.password`). */
  addSecretPattern(pattern: string): void {
    this._assertMutable('addSecretPattern');
    this._masker.addPattern(pattern);
  }

  /** Register a schema rule — applies to subsequent reloads. */
  addRule(rule: SchemaRule): void {
    this._assertMutable('addRule');
    this._schema.addRule(rule);
  }

  /**
   * Subscribe to changes. `prefix` (optional) scopes the listener to changes
   * under that path. Returns an unsubscribe function.
   */
  onChange(listener: ConfigChangeListener, prefix?: string): () => void {
    const entry: ScopedListener = { listener, prefix };
    this._listeners.push(entry);
    return () => {
      const i = this._listeners.indexOf(entry);
      if (i >= 0) this._listeners.splice(i, 1);
    };
  }

  // ------------------------------------------------------------------ runtime

  /**
   * Pull all sources, rebuild the effective config, validate, diff, notify.
   *
   * Rollback semantics: if the *new* effective config fails schema
   * validation, it is discarded and `this._effective` keeps the previously
   * validated config. Listeners are not invoked. The caller gets a
   * `ReloadResult` with `rolledBack: true` (plus thrown error in strict mode).
   */
  async reload(): Promise<ReloadResult> {
    this._assertMutable('reload');
    this._unresolvedRefs = [];

    // 1. Collect layers: static + polled sources.
    const layers: ConfigLayer[] = [...this._staticLayers];
    for (const src of this._sources) {
      const entries = await src.load();
      layers.push({ name: src.name, precedence: src.precedence, entries });
    }

    // 2. Merge → flat.
    const merger = new ConfigMerger();
    const merged = merger.merge(layers, this._environment, this._masker);

    // 3. Interpolate `${ref}` across the flat map; rebuild a MergedConfig with
    //    resolved values but identical origins.
    const flat = new Map<string, ConfigValue>(merged.paths().map((p) => [p, merged.get(p) as ConfigValue]));
    const resolved = this._interpolator.resolveAll(flat);
    const resolvedOrigins = new Map<string, string>();
    const resolvedTree: ConfigObject = {};
    for (const p of merged.paths()) {
      resolvedOrigins.set(p, merged.origin(p) ?? 'unknown');
      setPath(resolvedTree, p, resolved.get(p) as ConfigValue);
    }
    const effective = new MergedConfig(resolved, resolvedOrigins, resolvedTree, this._masker);

    // 4. Validate. Rollback on failure.
    const violations = this._schema.validate(effective);
    const diff = this._diffEngine.diff(this._effective, effective, this._clock());
    this._lastDiff = diff;

    if (violations.length > 0) {
      if (this._strict) throw new ConfigValidationError(violations);
      return { applied: false, rolledBack: this._effective !== null, diff, violations, unresolvedRefs: [...this._unresolvedRefs] };
    }

    this._effective = effective;

    // 5. Notify listeners (scoped).
    if (diff.changed) {
      for (const { listener, prefix } of [...this._listeners]) {
        const scoped = prefix === undefined ? diff : this._diffEngine.filterByPrefix(diff, prefix);
        if (scoped.changed || prefix === undefined) {
          listener(scoped, effective);
        }
      }
    }

    return { applied: true, rolledBack: false, diff, violations, unresolvedRefs: [...this._unresolvedRefs] };
  }

  /**
   * Runtime key write — equivalent to a transient OVERRIDE-precedence layer.
   * `path` is a dot-path. Triggers a diff+notify without a full source reload.
   */
  set(path: string, value: ConfigValue): ReloadResult {
    this._assertMutable('set');
    this._requireLoaded();

    const tree = this.effective.toJSON(false) as ConfigObject;
    setPath(tree, path, value);
    return this._applyRuntimeDelta(tree);
  }

  /** Remove a key at runtime (override-precedence removal). */
  unset(path: string): ReloadResult {
    this._assertMutable('unset');
    this._requireLoaded();
    const tree = this.effective.toJSON(false) as ConfigObject;
    deletePath(tree, path);
    return this._applyRuntimeDelta(tree);
  }

  /** Capture an immutable snapshot of the current effective config. */
  snapshot(): ConfigSnapshot {
    this._requireLoaded();
    const flat = this.effective.flatten();
    const deep = deepFreeze(deepMerge({}, unflatten(flat)));
    const frozenEffective = new FrozenEffectiveConfig(flat, (p) => this.effective.origin(p), deep, this._masker);
    const prev = this._snapshots.length > 0 ? this._snapshots[this._snapshots.length - 1].config : null;
    const snap: ConfigSnapshot = {
      id: this._snapshots.length,
      takenAt: this._clock(),
      config: frozenEffective,
      diffFromPrevious: this._diffEngine.diff(prev, frozenEffective, this._clock()),
    };
    this._snapshots.push(snap);
    return snap;
  }

  snapshots(): ReadonlyArray<ConfigSnapshot> {
    return this._snapshots;
  }

  /**
   * Freeze the engine: current effective config becomes immutable and all
   * mutation APIs throw FrozenConfigError. Freeze is one-way (config freeze
   * exists for "lock down for the request lifetime" semantics).
   */
  freeze(): void {
    this._requireLoaded();
    this._frozen = true;
  }

  /** Serialize the effective config with secrets masked. */
  toJSON(maskSecrets = true): ConfigObject {
    this._requireLoaded();
    return this.effective.toJSON(maskSecrets);
  }

  /** All `${ref}` placeholders that couldn't be resolved on last reload. */
  unresolvedRefs(): ReadonlyArray<string> {
    return this._unresolvedRefs;
  }

  // ------------------------------------------------------------------ private

  private _applyRuntimeDelta(tree: ConfigObject): ReloadResult {
    const flat = new Map<string, ConfigValue>();
    const f = flattenTree(tree);
    for (const k of Object.keys(f)) flat.set(k, f[k]);
    const resolved = this._interpolator.resolveAll(flat);
    const origins = new Map<string, string>();
    const resolvedTree: ConfigObject = {};
    for (const [p, v] of resolved) {
      origins.set(p, this._effective?.origin(p) ?? 'runtime-override');
      setPath(resolvedTree, p, v);
    }
    const effective = new MergedConfig(resolved, origins, resolvedTree, this._masker);

    const violations = this._schema.validate(effective);
    const diff = this._diffEngine.diff(this._effective, effective, this._clock());
    this._lastDiff = diff;
    if (violations.length > 0) {
      if (this._strict) throw new ConfigValidationError(violations);
      return { applied: false, rolledBack: true, diff, violations, unresolvedRefs: [...this._unresolvedRefs] };
    }
    this._effective = effective;
    if (diff.changed) {
      for (const { listener, prefix } of [...this._listeners]) {
        const scoped = prefix === undefined ? diff : this._diffEngine.filterByPrefix(diff, prefix);
        if (scoped.changed || prefix === undefined) listener(scoped, effective);
      }
    }
    return { applied: true, rolledBack: false, diff, violations, unresolvedRefs: [...this._unresolvedRefs] };
  }

  private _assertMutable(op: string): void {
    if (this._frozen) throw new FrozenConfigError(op);
  }

  private _requireLoaded(): void {
    if (this._effective === null) {
      throw new Error('config engine has not been loaded — call reload() first');
    }
  }
}

/** Rebuild a nested tree from a flat path map. */
function unflatten(flat: Record<string, ConfigValue>): ConfigObject {
  const out: ConfigObject = {};
  for (const p of Object.keys(flat)) setPath(out, p, flat[p]);
  return out;
}

/** Recursively Object.freeze a config tree (arrays included). */
export function deepFreeze<T>(obj: T): T {
  if (obj !== null && typeof obj === 'object' && !Object.isFrozen(obj)) {
    for (const k of Object.keys(obj as Record<string, unknown>)) {
      deepFreeze((obj as Record<string, unknown>)[k]);
    }
    Object.freeze(obj);
  }
  return obj;
}

/**
 * EffectiveConfig wrapper that exposes a deep-frozen tree — used by
 * `snapshot()` so captured snapshots cannot be mutated by callers.
 */
class FrozenEffectiveConfig implements EffectiveConfig {
  private readonly _flat: Record<string, ConfigValue>;
  private readonly _originFn: (p: string) => string | undefined;
  private readonly _tree: ConfigObject;
  private readonly _masker: SecretMasker;

  constructor(
    flat: Record<string, ConfigValue>,
    originFn: (p: string) => string | undefined,
    tree: ConfigObject,
    masker: SecretMasker
  ) {
    this._flat = { ...flat };
    this._originFn = originFn;
    this._tree = tree;
    this._masker = masker;
  }

  get(path: string): ConfigValue | undefined {
    return this._flat[path];
  }

  getString(path: string, fallback?: string): string {
    const v = this._flat[path];
    if (v === undefined) {
      if (fallback !== undefined) return fallback;
      throw new Error(`missing required config key '${path}'`);
    }
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    throw new Error(`config key '${path}' is not a string-coercible scalar`);
  }

  getNumber(path: string, fallback?: number): number {
    const v = this._flat[path];
    if (v === undefined) {
      if (fallback !== undefined) return fallback;
      throw new Error(`missing required config key '${path}'`);
    }
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
    throw new Error(`config key '${path}' is not a number`);
  }

  getBoolean(path: string, fallback?: boolean): boolean {
    const v = this._flat[path];
    if (v === undefined) {
      if (fallback !== undefined) return fallback;
      throw new Error(`missing required config key '${path}'`);
    }
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') {
      const l = v.toLowerCase();
      if (l === 'true' || l === '1' || l === 'yes' || l === 'on') return true;
      if (l === 'false' || l === '0' || l === 'no' || l === 'off') return false;
    }
    throw new Error(`config key '${path}' is not a boolean`);
  }

  paths(): ReadonlyArray<string> {
    return Object.keys(this._flat);
  }

  flatten(): Record<string, ConfigValue> {
    return { ...this._flat };
  }

  origin(path: string): string | undefined {
    return this._originFn(path);
  }

  toJSON(maskSecrets = true): ConfigObject {
    if (!maskSecrets || this._masker.patternCount === 0) {
      // Return the frozen tree itself — it's deeply frozen, so exposing the
      // reference is safe and lets callers observe immutability directly.
      return this._tree;
    }
    const clone = deepMerge({}, this._tree);
    this._masker.maskTree(clone);
    return clone;
  }
}

/** Convenience: build a ConfigLayer from a nested object (exported helper). */
export function layerFromObject(
  name: string,
  precedence: ConfigPrecedence,
  obj: ConfigObject,
  environments?: ReadonlyArray<string>
): ConfigLayer {
  return { name, precedence, entries: flattenTree(obj), ...(environments ? { environments } : {}) };
}

/** Convenience: check a nested object has a dot path. */
export function hasPath(tree: ConfigObject, path: string): boolean {
  return getPath(tree, path) !== undefined;
}

export { getPath, setPath, deletePath, splitPath, isConfigObject };
