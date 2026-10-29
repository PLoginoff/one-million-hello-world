/**
 * Chaos Engineering — Consistent Hash Ring
 *
 * Consistent hashing for deterministic target selection in blast-radius
 * scoping: given a request key (user id, session id), the ring maps it to the
 * same target every time — so "10% of requests" becomes "the same 10% of
 * users", which is what real chaos tools want (repeatable impact, not random
 * per-request flapping).
 *
 * Algorithm
 * ---------
 * Each target owns `vnodeCount` virtual nodes placed on a 2^32 ring via
 * FNV-1a hashing of `targetId#vnode`. `pick(key)` walks clockwise from
 * `hash(key)` to the first vnode — O(log V) via sorted-array binary search.
 * Adding/removing a target only remaps its vnode arcs (O(V) rebuild of the
 * affected arc ownership), leaving other assignments stable — the property
 * that makes consistent hashing suitable for blast-radius membership.
 *
 * `pickN(key, n)` returns the n distinct targets found walking the ring —
 * used for "affect the n owners of this shard" scoping.
 *
 * @module ChaosEngineering/Engine
 */

const MASK32 = 0xffffffffn;

/** FNV-1a 32-bit hash — fast, well-mixed for vnode placement. */
function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

interface VNode {
  readonly point: number;
  readonly targetId: string;
}

export class ConsistentHashRing {
  private readonly _vnodeCount: number;
  /** Sorted vnode points + owners; parallel arrays kept in sync. */
  private _points: number[] = [];
  private _owners: string[] = [];
  private readonly _targets = new Set<string>();

  constructor(vnodeCount = 160) {
    if (vnodeCount < 1) throw new RangeError('vnodeCount must be ≥ 1');
    this._vnodeCount = vnodeCount;
  }

  get size(): number {
    return this._targets.size;
  }

  get targets(): ReadonlyArray<string> {
    return [...this._targets];
  }

  /** Add a target with `weight` vnode-multiplier (default 1). O(V log V). */
  add(targetId: string, weight = 1): void {
    if (this._targets.has(targetId)) return;
    this._targets.add(targetId);
    const vnodes = Math.max(1, Math.round(this._vnodeCount * weight));
    for (let i = 0; i < vnodes; i++) {
      const point = Number(BigInt(fnv1a32(`${targetId}#${i}`)) & MASK32);
      const idx = this._insertionIndex(point);
      this._points.splice(idx, 0, point);
      this._owners.splice(idx, 0, targetId);
    }
  }

  /** Remove a target and all its vnodes. O(V). */
  remove(targetId: string): boolean {
    if (!this._targets.delete(targetId)) return false;
    const pts: number[] = [];
    const own: string[] = [];
    for (let i = 0; i < this._points.length; i++) {
      if (this._owners[i] !== targetId) {
        pts.push(this._points[i]);
        own.push(this._owners[i]);
      }
    }
    this._points = pts;
    this._owners = own;
    return true;
  }

  /**
   * Map `key` to its owning target — clockwise walk to the first vnode.
   * Returns undefined on an empty ring.
   */
  pick(key: string): string | undefined {
    if (this._points.length === 0) return undefined;
    const h = Number(BigInt(fnv1a32(key)) & MASK32);
    return this._owners[this._successorIndex(h)];
  }

  /**
   * Map `key` to the first `n` DISTINCT targets clockwise on the ring —
   * e.g. primary + replicas for a shard.
   */
  pickN(key: string, n: number): string[] {
    if (this._points.length === 0 || n <= 0) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    const h = Number(BigInt(fnv1a32(key)) & MASK32);
    let i = this._successorIndex(h);
    const start = i;
    do {
      const owner = this._owners[i];
      if (!seen.has(owner)) {
        seen.add(owner);
        out.push(owner);
        if (out.length >= n) break;
      }
      i = (i + 1) % this._points.length;
    } while (i !== start);
    return out;
  }

  /**
   * Fraction of keys (sampled deterministically) mapped to `targetId` —
   * measures actual balance vs the theoretical 1/N.
   */
  measuredShare(targetId: string, sampleKeys = 1000): number {
    if (!this._targets.has(targetId) || sampleKeys <= 0) return 0;
    let hits = 0;
    for (let i = 0; i < sampleKeys; i++) {
      if (this.pick(`probe-${i}`) === targetId) hits++;
    }
    return hits / sampleKeys;
  }

  /**
   * Membership test for blast-radius scoping: does `key` map to a target in
   * `selected`? O(log V + |selected|). This is the deterministic alternative
   * to percentage draws — the same key always lands in/out of scope.
   */
  inScope(key: string, selected: ReadonlySet<string>): boolean {
    const owner = this.pick(key);
    return owner !== undefined && selected.has(owner);
  }

  /**
   * Choose ~`fraction` of targets deterministically by walking the ring —
   * picks every ⌊1/fraction⌋-th distinct owner. Returns the selected set.
   */
  selectFraction(fraction: number): Set<string> {
    if (!(fraction > 0 && fraction <= 1)) {
      throw new RangeError('fraction must be in (0,1]');
    }
    const out = new Set<string>();
    if (this._targets.size === 0) return out;
    const wanted = Math.max(1, Math.round(this._targets.size * fraction));
    const stride = Math.max(1, Math.floor(this._targets.size / wanted));
    const owners = this.targets;
    for (let i = 0; i < owners.length && out.size < wanted; i += stride) {
      out.add(owners[i]);
    }
    return out;
  }

  // ------------------------------------------------------------------ private

  /** First index whose point ≥ h (wrapping). */
  private _successorIndex(h: number): number {
    let lo = 0;
    let hi = this._points.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this._points[mid] < h) lo = mid + 1;
      else hi = mid;
    }
    return lo === this._points.length ? 0 : lo;
  }

  /** Sorted insertion index for a new point. */
  private _insertionIndex(point: number): number {
    let lo = 0;
    let hi = this._points.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this._points[mid] <= point) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}
