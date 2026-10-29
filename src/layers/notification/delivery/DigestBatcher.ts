/**
 * Digest Batcher
 *
 * Collects notifications flagged 'digest' by preferences and folds them
 * into a single summary notification per (user, channel, topic) when either:
 *   - the batch reaches `every` items, or
 *   - `flush()` is called (e.g. on a periodic sweep).
 *
 * Produces a {@link Digest} whose items are the raw notifications; the
 * engine renders it through the special 'digest' template.
 *
 * @module NotificationLayer/Delivery
 */

import { Channel, Clock, Digest, NotificationRequest, SystemClock } from './NotificationTypes';

interface Bucket {
  items: NotificationRequest[];
  windowStart: number;
  every: number;
}

export class DigestBatcher {
  /** "user|channel|topic" → bucket */
  private readonly _buckets = new Map<string, Bucket>();

  constructor(private readonly _clock: Clock = new SystemClock()) {}

  private _key(userId: string, channel: Channel, topic: string): string {
    return `${userId}|${channel}|${topic}`;
  }

  /**
   * Add a notification to its digest bucket. Returns a ready-to-send Digest
   * when the bucket hit its `every` threshold, otherwise null.
   */
  add(n: NotificationRequest, channel: Channel, every: number): Digest | null {
    const key = this._key(n.userId, channel, n.topic);
    let b = this._buckets.get(key);
    if (!b) {
      b = { items: [], windowStart: this._clock.now(), every };
      this._buckets.set(key, b);
    }
    b.items.push(n);
    if (b.items.length >= b.every) {
      return this._drain(key, b);
    }
    return null;
  }

  /**
   * Drain ALL buckets regardless of threshold — called on a sweep cadence.
   */
  flush(): readonly Digest[] {
    const out: Digest[] = [];
    for (const [key, b] of this._buckets) {
      if (b.items.length > 0) out.push(this._drain(key, b));
    }
    return out;
  }

  /**
   * Flush only buckets for a specific user (e.g. before an immediate send).
   */
  flushUser(userId: string): readonly Digest[] {
    const out: Digest[] = [];
    for (const [key, b] of this._buckets) {
      if (key.startsWith(`${userId}|`) && b.items.length > 0) {
        out.push(this._drain(key, b));
      }
    }
    return out;
  }

  /** Count of buffered items across all buckets. */
  get pendingCount(): number {
    let n = 0;
    for (const b of this._buckets.values()) n += b.items.length;
    return n;
  }

  private _drain(key: string, b: Bucket): Digest {
    this._buckets.delete(key);
    const [userId, channel, topic] = key.split('|') as [string, Channel, string];
    return {
      userId,
      channel,
      topic,
      items: b.items,
      windowStart: b.windowStart,
      windowEnd: this._clock.now(),
    };
  }
}
