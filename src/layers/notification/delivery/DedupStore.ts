/**
 * Dedup Store
 *
 * Content-hash deduplication: identical notifications (same user, channel,
 * topic, rendered body) within a TTL window are collapsed. Producers may
 * also supply an explicit `dedupKey` which short-circuits hashing.
 *
 * Hash is FNV-1a — fast, deterministic, good enough for dedup (not crypto).
 *
 * @module NotificationLayer/Delivery
 */

import { Channel, Clock, NotificationRequest, SystemClock } from './NotificationTypes';

/** FNV-1a 32-bit hash over a string, hex-encoded. */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    // h *= 16777619, keeping 32 bits
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Compute the dedup hash for a notification on a channel: explicit key wins,
 * otherwise hash(user|channel|topic|template|sorted-vars).
 */
export function dedupHash(n: NotificationRequest, channel: Channel): string {
  if (n.dedupKey) return `k:${n.dedupKey}`;
  const vars = Object.keys(n.vars)
    .sort()
    .map((k) => `${k}=${JSON.stringify(n.vars[k])}`)
    .join(',');
  return fnv1a(`${n.userId}|${channel}|${n.topic}|${n.template}|${vars}`);
}

/**
 * Sliding-window dedup store. `check` returns true when the hash was seen
 * within `windowMs`.
 */
export class DedupStore {
  private readonly _seen = new Map<string, number>(); // hash → last-seen ms

  constructor(
    private readonly _windowMs: number = 5 * 60_000,
    private readonly _clock: Clock = new SystemClock()
  ) {}

  /**
   * Returns true if this hash is a duplicate inside the window. Records the
   * hash on first sight.
   */
  check(hash: string): boolean {
    const now = this._clock.now();
    this._evict(now);
    const last = this._seen.get(hash);
    if (last !== undefined && now - last < this._windowMs) {
      return true;
    }
    this._seen.set(hash, now);
    return false;
  }

  /** Drop all entries (tests / flush). */
  clear(): void {
    this._seen.clear();
  }

  /** Number of live hashes (post-eviction). */
  get size(): number {
    this._evict(this._clock.now());
    return this._seen.size;
  }

  private _evict(now: number): void {
    // Map iteration in insertion order; oldest entries are evicted first.
    for (const [h, t] of this._seen) {
      if (now - t >= this._windowMs) this._seen.delete(h);
    }
  }
}
