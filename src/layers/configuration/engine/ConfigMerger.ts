/**
 * Configuration Engine — Layered Merger
 *
 * Folds an ordered set of flat ConfigLayers into a single effective config.
 *
 * Merge semantics
 * ---------------
 * - Layers are sorted by `ConfigPrecedence` ascending; higher precedence wins.
 * - Two layers with the *same* precedence are merged in registration order —
 *   later registrations win (last-writer-wins within a tier).
 * - Merging is deep for plain objects: `a.b.c` from a low tier survives when a
 *   higher tier only overrides `a.b.d`. Arrays are atomic leaf values — a
 *   higher-precedence array *replaces* the lower one wholesale (no index-wise
 *   merge), matching Kubernetes/env-var semantics where lists are opaque.
 * - `null` is a real value: setting a key to `null` in a higher tier masks the
 *   lower value (it is not deleted — `get` returns `null`).
 * - Every effective path remembers which layer provided it (`origin`), which
 *   powers both the diff engine's source attribution and debugging.
 *
 * Complexity: O(total flattened paths × path depth). Deep merge allocates new
 * nodes only along overwritten branches (persistent-ish structure sharing).
 *
 * @module Configuration/Engine
 */

import {
  ConfigLayer,
  ConfigObject,
  ConfigValue,
  EffectiveConfig,
  isConfigObject,
} from './ConfigTypes';
import { SecretMasker } from './SecretMasker';

/**
 * Mutable node used while building the merged tree. Leaf values keep their
 * `ConfigValue` shape; object nodes keep a `Map` of children plus the name of
 * the layer that last touched the node itself.
 */
interface MergeNode {
  children: Map<string, MergeNode>;
  /** Set when this node holds a leaf value rather than children. */
  leaf: ConfigValue | undefined;
  isLeaf: boolean;
  origin: string | undefined;
}

function makeNode(): MergeNode {
  return { children: new Map(), leaf: undefined, isLeaf: false, origin: undefined };
}

/** Split a dot-path into segments. `a.b.0.c` → ['a','b','0','c']. */
export function splitPath(path: string): string[] {
  return path.split('.').filter((s) => s.length > 0);
}

/**
 * Deep-merge `source` into `target`. Returns a NEW object — the inputs are
 * never mutated, which keeps layer payloads safe to reuse across reloads.
 * Arrays and nulls replace; objects recurse; scalars overwrite.
 */
export function deepMerge(target: ConfigObject, source: ConfigObject): ConfigObject {
  const out: ConfigObject = { ...target };
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = target[key];
    if (isConfigObject(sv) && isConfigObject(tv)) {
      out[key] = deepMerge(tv, sv);
    } else if (isConfigObject(sv)) {
      // Source is an object, target leaf or missing — clone the object so the
      // merged tree never aliases the caller's payload.
      out[key] = deepMerge({}, sv);
    } else if (Array.isArray(sv)) {
      out[key] = sv.slice();
    } else {
      out[key] = sv;
    }
  }
  return out;
}

/** Get the value at a dot-path inside a nested ConfigObject. */
export function getPath(tree: ConfigObject, path: string): ConfigValue | undefined {
  let cur: ConfigValue = tree;
  for (const seg of splitPath(path)) {
    if (!isConfigObject(cur)) return undefined;
    cur = cur[seg];
  }
  return cur;
}

/** Set the value at a dot-path, creating intermediate objects. Mutates tree. */
export function setPath(tree: ConfigObject, path: string, value: ConfigValue): void {
  const segs = splitPath(path);
  if (segs.length === 0) return;
  let cur = tree;
  for (let i = 0; i < segs.length - 1; i++) {
    const next = cur[segs[i]];
    if (!isConfigObject(next)) {
      cur[segs[i]] = {};
    }
    cur = cur[segs[i]] as ConfigObject;
  }
  cur[segs[segs.length - 1]] = value;
}

/** Delete the value at a dot-path. Returns true when something was removed. */
export function deletePath(tree: ConfigObject, path: string): boolean {
  const segs = splitPath(path);
  if (segs.length === 0) return false;
  let cur: ConfigValue = tree;
  for (let i = 0; i < segs.length - 1; i++) {
    if (!isConfigObject(cur)) return false;
    cur = cur[segs[i]];
  }
  if (isConfigObject(cur) && segs[segs.length - 1] in cur) {
    delete cur[segs[segs.length - 1]];
    return true;
  }
  return false;
}

/** Flatten a nested tree into dot-path → leaf value. */
export function flattenTree(tree: ConfigObject, prefix = '', out: Record<string, ConfigValue> = {}): Record<string, ConfigValue> {
  for (const key of Object.keys(tree)) {
    const v = tree[key];
    const p = prefix === '' ? key : `${prefix}.${key}`;
    if (isConfigObject(v)) {
      flattenTree(v, p, out);
    } else {
      out[p] = v;
    }
  }
  return out;
}

/** Deep structural equality for ConfigValues (order-sensitive for arrays). */
export function valueEquals(a: ConfigValue | undefined, b: ConfigValue | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => valueEquals(v, b[i]));
  }
  if (isConfigObject(a) && isConfigObject(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => valueEquals(a[k], b[k]));
  }
  return false;
}

/**
 * The merged view of all layers. Implements EffectiveConfig with O(1)-ish
 * path lookups against a precomputed flat map (paths are flattened once at
 * merge time instead of walking the tree per `get`).
 */
export class MergedConfig implements EffectiveConfig {
  private readonly _flat: Map<string, ConfigValue>;
  private readonly _origins: Map<string, string>;
  private readonly _tree: ConfigObject;
  private readonly _masker: SecretMasker;

  constructor(flat: Map<string, ConfigValue>, origins: Map<string, string>, tree: ConfigObject, masker: SecretMasker) {
    this._flat = flat;
    this._origins = origins;
    this._tree = tree;
    this._masker = masker;
  }

  get(path: string): ConfigValue | undefined {
    return this._flat.get(path);
  }

  getString(path: string, fallback?: string): string {
    const v = this._flat.get(path);
    if (v === undefined) {
      if (fallback !== undefined) return fallback;
      throw new Error(`missing required config key '${path}'`);
    }
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    throw new Error(`config key '${path}' is not a string-coercible scalar`);
  }

  getNumber(path: string, fallback?: number): number {
    const v = this._flat.get(path);
    if (v === undefined) {
      if (fallback !== undefined) return fallback;
      throw new Error(`missing required config key '${path}'`);
    }
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
    if (typeof v === 'boolean') return v ? 1 : 0;
    throw new Error(`config key '${path}' is not a number`);
  }

  getBoolean(path: string, fallback?: boolean): boolean {
    const v = this._flat.get(path);
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
    if (typeof v === 'number') return v !== 0;
    throw new Error(`config key '${path}' is not a boolean`);
  }

  paths(): ReadonlyArray<string> {
    return Array.from(this._flat.keys());
  }

  flatten(): Record<string, ConfigValue> {
    const out: Record<string, ConfigValue> = {};
    for (const [k, v] of this._flat) out[k] = v;
    return out;
  }

  origin(path: string): string | undefined {
    return this._origins.get(path);
  }

  toJSON(maskSecrets = true): ConfigObject {
    const clone = deepMerge({}, this._tree);
    if (maskSecrets && this._masker.patternCount > 0) {
      this._masker.maskTree(clone);
    }
    return clone;
  }
}

/**
 * Fold `layers` into a MergedConfig. Layers are applied in precedence order;
 * within a tier, registration order breaks ties (later wins).
 *
 * The tree itself is built with a node structure so a high-precedence scalar
 * can replace a low-precedence subtree, and vice versa: when a leaf lands on a
 * branch, the branch is discarded; when a branch lands on a leaf, the leaf is
 * discarded.
 */
export class ConfigMerger {
  merge(layers: ReadonlyArray<ConfigLayer>, environment: string, masker: SecretMasker): MergedConfig {
    const applicable = layers
      .filter((l) => !l.environments || l.environments.length === 0 || l.environments.includes(environment))
      .sort((a, b) => a.precedence - b.precedence);

    const root = makeNode();

    for (const layer of applicable) {
      for (const path of Object.keys(layer.entries)) {
        this._setPath(root, splitPath(path), layer.entries[path], layer.name);
      }
    }

    const flat = new Map<string, ConfigValue>();
    const origins = new Map<string, string>();
    const tree = this._materialize(root, '', flat, origins);
    return new MergedConfig(flat, origins, tree, masker);
  }

  private _setPath(node: MergeNode, segs: string[], value: ConfigValue, origin: string): void {
    if (segs.length === 0) return;
    let cur = node;
    for (let i = 0; i < segs.length - 1; i++) {
      let child = cur.children.get(segs[i]);
      // A leaf occupying a branch position is replaced by an object node —
      // unless the leaf itself holds an object, in which case we expand it
      // so deep-merge semantics survive (`a.b={c:1}` + `a.b.d=5` → both).
      if (!child) {
        child = makeNode();
        cur.children.set(segs[i], child);
      } else if (child.isLeaf) {
        const expanded = makeNode();
        expanded.origin = child.origin;
        if (isConfigObject(child.leaf)) {
          const leafFlat = flattenTree(child.leaf as ConfigObject);
          for (const sub of Object.keys(leafFlat)) {
            this._setPath(expanded, splitPath(sub), leafFlat[sub], child.origin ?? 'unknown');
          }
        }
        child = expanded;
        cur.children.set(segs[i], child);
      }
      cur = child;
    }
    const last = segs[segs.length - 1];
    // If a subtree exists at this position, a higher-precedence *scalar*
    // replaces it outright (branch → leaf collapse). An object-typed leaf,
    // however, deep-merges into the existing subtree.
    const existing = cur.children.get(last);
    if (existing && !existing.isLeaf && isConfigObject(value)) {
      const incoming = flattenTree(value);
      for (const sub of Object.keys(incoming)) {
        this._setPath(existing, splitPath(sub), incoming[sub], origin);
      }
      return;
    }
    const leafNode: MergeNode = { children: new Map(), leaf: value, isLeaf: true, origin };
    cur.children.set(last, leafNode);
  }

  private _materialize(
    node: MergeNode,
    prefix: string,
    flat: Map<string, ConfigValue>,
    origins: Map<string, string>
  ): ConfigObject {
    const out: ConfigObject = {};
    for (const [key, child] of node.children) {
      const p = prefix === '' ? key : `${prefix}.${key}`;
      if (child.isLeaf) {
        const v = child.leaf as ConfigValue;
        if (isConfigObject(v)) {
          // Object-typed leaf from a flat entry (`{ 'a.b': { c: 1 } }`) —
          // expand it into the flat map so `get('a.b.c')` works.
          const sub = deepMerge({}, v);
          out[key] = sub;
          const subFlat = flattenTree(sub, p);
          for (const sp of Object.keys(subFlat)) {
            flat.set(sp, subFlat[sp]);
            origins.set(sp, child.origin ?? 'unknown');
          }
        } else if (Array.isArray(v)) {
          out[key] = v.slice();
          flat.set(p, v.slice());
          origins.set(p, child.origin ?? 'unknown');
        } else {
          out[key] = v;
          flat.set(p, v);
          origins.set(p, child.origin ?? 'unknown');
        }
      } else {
        out[key] = this._materialize(child, p, flat, origins);
      }
    }
    return out;
  }
}
