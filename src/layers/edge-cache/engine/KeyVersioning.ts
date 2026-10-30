/**
 * KeyVersioning — deploy-aware cache-key versioning.
 *
 * After a deploy, cached entries computed by the old code may be wrong
 * (changed JSON shape, new markup, different prices). Two patterns exist:
 *
 *   1. Hard purge: wipe everything (cold cache stampede).
 *   2. Versioned keys: prefix every cache key with a deploy version —
 *      old entries become unreachable instantly but are lazily evicted
 *      by TTL/LRU instead of purged. Zero stampede; slight memory cost.
 *
 * This module does (2):
 *
 *   - `versionedKey(baseKey)` → `v{deploy}::{baseKey}` — lookup always
 *     hits the current deploy's entries.
 *   - `bump()` on deploy: old keys orphaned (naturally TTL'd out).
 *   - `invalidateVersion(v)`: drop a whole version's keys (rollback
 *     support — redeploy of a bad build doesn't resurrect ITS cache).
 *   - `purgeAllExceptCurrent()`: reclaim memory of orphaned versions —
 *     the gradual equivalent of a hard purge, callable after the new
 *     version has warmed.
 *   - `versionOf(key)` / `stripVersion(key)` — tooling helpers.
 *
 * It wraps an arbitrary {get/set/delete/keys} map-like store so it works
 * against EdgeCacheEngine internals or any Map.
 *
 * @module EdgeCache/Engine
 */

const SEP = '::';
const PREFIX_RE = /^v(\d+)::/;

export interface VersionedStore<V> {
  get(key: string): V | undefined;
  set(key: string, value: V): void;
  delete(key: string): boolean;
  keys(): IterableIterator<string> | string[];
}

/** Minimal adapter over a plain Map. */
export function mapStore<V>(map: Map<string, V>): VersionedStore<V> {
  return {
    get: (k) => map.get(k),
    set: (k, v) => { map.set(k, v); },
    delete: (k) => map.delete(k),
    keys: () => map.keys(),
  };
}

export class KeyVersioning<V> {
  private readonly _store: VersionedStore<V>;
  private _version: number;

  constructor(store: VersionedStore<V>, initialVersion = 1) {
    this._store = store;
    this._version = initialVersion;
  }

  get version(): number {
    return this._version;
  }

  /** Deploy a new version — subsequent writes/reads move to it. */
  bump(): number {
    this._version++;
    return this._version;
  }

  versionedKey(baseKey: string): string {
    return `v${this._version}${SEP}${baseKey}`;
  }

  /** Version embedded in a versioned key; 0 if unversioned. */
  static versionOf(key: string): number {
    const m = PREFIX_RE.exec(key);
    return m ? parseInt(m[1], 10) : 0;
  }

  /** Base key part of a versioned key. */
  static stripVersion(key: string): string {
    return key.replace(PREFIX_RE, '');
  }

  get(baseKey: string): V | undefined {
    return this._store.get(this.versionedKey(baseKey));
  }

  set(baseKey: string, value: V): void {
    this._store.set(this.versionedKey(baseKey), value);
  }

  delete(baseKey: string): boolean {
    return this._store.delete(this.versionedKey(baseKey));
  }

  /**
   * Drop every entry carrying version `v` — used when a deploy is
   * ROLLED BACK (its cached entries must not leak back into service
   * if the version number is reused) or for targeted invalidation.
   */
  invalidateVersion(v: number): number {
    let n = 0;
    for (const key of [...this._store.keys()]) {
      if (KeyVersioning.versionOf(key) === v) {
        this._store.delete(key);
        n++;
      }
    }
    return n;
  }

  /**
   * Reclaim entries from non-current versions — the gradual equivalent
   * of a full purge, run after warm-up completes.
   * Unversioned entries (v0) are left alone.
   */
  purgeOldVersions(): number {
    let n = 0;
    for (const key of [...this._store.keys()]) {
      const v = KeyVersioning.versionOf(key);
      if (v !== 0 && v !== this._version) {
        this._store.delete(key);
        n++;
      }
    }
    return n;
  }

  /** Entries per version — memory-accounting for dashboards. */
  versionCounts(): Record<number, number> {
    const out: Record<number, number> = {};
    for (const key of this._store.keys()) {
      const v = KeyVersioning.versionOf(key);
      out[v] = (out[v] ?? 0) + 1;
    }
    return out;
  }
}
