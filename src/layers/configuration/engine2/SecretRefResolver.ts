/**
 * Configuration Engine2 — Secret Reference Resolution & Rotation Hooks
 *
 * Config values often need secrets at runtime but must never store them:
 * the config holds `${secret:db/primary/password}` and the runtime
 * resolves. This module adds the pieces engine/ConfigInterpolator lacks:
 *
 *   - Reference GRAPHS: `resolve(tree)` walks a ConfigValue tree and
 *     substitutes `${secret:path[@version]}` placeholders; nested
 *     templates inside resolved values are resolved recursively with a
 *     cycle guard.
 *   - Live registry: secrets are held by KEY (not embedded), so rotating
 *     a secret updates every config reference in place via re-resolution.
 *   - Rotation HOOKS: `onRotate(key, cb)` fires after `rotate(key)` —
 *     a webhook that must re-resolve its webhook secret, a pool that must
 *     re-open connections. Hooks are keyed and removable.
 *   - Stale-reference report: `references()` maps each secret key to the
 *     config paths referencing it — the "who breaks if I rotate X?" check.
 *
 * The vault layer's provider handles storage+versioning; this resolver is
 * deliberately storage-agnostic — hosts inject `get(key)` however they
 * back it (vault, env vars, a KMS…).
 *
 * Complexity: resolution O(tree nodes × template length); reference index
 * rebuilt lazily on resolve.
 *
 * @module Configuration/Engine2
 */

import { ConfigValue, isConfigObject } from '../engine/ConfigTypes';

/** `${secret:path}` or `${secret:path@version}` placeholders. */
const REF_RE = /\$\{secret:([^}@\s]+)(?:@(\d+))?\}/g;

export type SecretGetter = (key: string, version?: number) => string | undefined;

export type RotationHook = (key: string, newVersion: number) => void;

export interface SecretRef {
  /** Config path containing the reference. */
  readonly configPath: string;
  /** Secret key referenced. */
  readonly key: string;
  /** Pinned version, if any. */
  readonly version?: number;
}

export interface ResolveResult {
  readonly tree: ConfigValue;
  /** Every reference found during resolution. */
  readonly refs: readonly SecretRef[];
  /** Keys that failed to resolve — left as placeholders in the output. */
  readonly unresolved: readonly string[];
}

export class SecretRefResolver {
  private readonly _get: SecretGetter;
  private readonly _hooks = new Map<string, Set<RotationHook>>();
  private _refs: SecretRef[] = [];

  constructor(get: SecretGetter) {
    this._get = get;
  }

  /** Register a hook fired when `key` rotates (or '*' for all keys). */
  onRotate(key: string, hook: RotationHook): () => void {
    let set = this._hooks.get(key);
    if (!set) {
      set = new Set();
      this._hooks.set(key, set);
    }
    set.add(hook);
    return () => set.delete(hook);
  }

  /**
   * Notify that `key` rotated to `version`. Fires the key's hooks and
   * the '*' wildcard hooks. Hook exceptions are collected, not thrown —
   * one bad consumer must not prevent the rotation broadcast.
   */
  notifyRotated(key: string, newVersion: number): Error[] {
    const errors: Error[] = [];
    const fire = (set: Set<RotationHook> | undefined): void => {
      for (const h of set ?? []) {
        try {
          h(key, newVersion);
        } catch (e) {
          errors.push(e instanceof Error ? e : new Error(String(e)));
        }
      }
    };
    fire(this._hooks.get(key));
    fire(this._hooks.get('*'));
    return errors;
  }

  /**
   * Resolve every `${secret:…}` placeholder in the tree. Values are
   * immutable — returns a NEW tree. Unresolved keys keep their placeholder
   * (strict mode would throw; callers get `unresolved` to decide).
   */
  resolve(tree: ConfigValue): ResolveResult {
    const refs: SecretRef[] = [];
    const unresolved = new Set<string>();
    const out = this._resolveNode(tree, '', refs, unresolved, 0);
    this._refs = refs;
    return { tree: out, refs, unresolved: [...unresolved] };
  }

  private _resolveNode(
    node: ConfigValue,
    path: string,
    refs: SecretRef[],
    unresolved: Set<string>,
    depth: number
  ): ConfigValue {
    if (depth > 16) {
      throw new Error(`secret reference depth limit at '${path}' — cyclic template?`);
    }
    if (typeof node === 'string') {
      return node.replace(REF_RE, (full, key: string, ver: string | undefined) => {
        refs.push({ configPath: path, key, version: ver === undefined ? undefined : Number(ver) });
        const value = this._get(key, ver === undefined ? undefined : Number(ver));
        if (value === undefined) {
          unresolved.add(key);
          return full;
        }
        // A resolved value may itself contain a reference (chained secrets).
        return this._resolveNode(value, path, refs, unresolved, depth + 1) as string;
      });
    }
    if (Array.isArray(node)) {
      return node.map((v, i) => this._resolveNode(v, `${path}[${i}]`, refs, unresolved, depth));
    }
    if (isConfigObject(node)) {
      const out: Record<string, ConfigValue> = {};
      for (const [k, v] of Object.entries(node)) {
        out[k] = this._resolveNode(v, path === '' ? k : `${path}.${k}`, refs, unresolved, depth);
      }
      return out;
    }
    return node;
  }

  /**
   * Key → config paths referencing it — the pre-rotation impact check.
   * Reflects the LAST resolve() call; callers should resolve before asking.
   */
  references(): Map<string, string[]> {
    const out = new Map<string, string[]>();
    for (const r of this._refs) {
      const list = out.get(r.key) ?? [];
      if (!list.includes(r.configPath)) list.push(r.configPath);
      out.set(r.key, list);
    }
    return out;
  }

  /** Extract references from a tree WITHOUT resolving (static analysis). */
  static scan(tree: ConfigValue, basePath = ''): SecretRef[] {
    const refs: SecretRef[] = [];
    const walk = (n: ConfigValue, path: string): void => {
      if (typeof n === 'string') {
        for (const m of n.matchAll(REF_RE)) {
          refs.push({
            configPath: path,
            key: m[1],
            version: m[2] === undefined ? undefined : Number(m[2]),
          });
        }
      } else if (Array.isArray(n)) {
        n.forEach((v, i) => walk(v, `${path}[${i}]`));
      } else if (isConfigObject(n)) {
        for (const [k, v] of Object.entries(n)) walk(v, path === '' ? k : `${path}.${k}`);
      }
    };
    walk(tree, basePath);
    return refs;
  }
}
