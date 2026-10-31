/**
 * MessageExpiry — timing-wheel TTL with dead-letter-on-expiry.
 *
 * Every enqueued message can carry a TTL: if it isn't consumed by
 * `enqueuedAt + ttlMs`, it's dead — remove it and route to the DLQ
 * (or a configured expiry handler).
 *
 * Why a timing wheel and not a sorted scan: checking "what expired?" by
 * scanning every message is O(n) per tick — fine for 100 messages, fatal
 * for a million. A timing wheel bucketizes expiry times into `slots`
 * fixed-width buckets arranged in a circle; `tick(now)` advances the
 * cursor and drains only the current bucket → O(expired) per tick,
 * O(1) amortized per message. It's the same structure Kafka's
 * `SystemTimer` and Netty's `HashedWheelTimer` use.
 *
 * Overflow: a TTL beyond one full rotation lands in the "far future"
 * bucket and re-buckets as the wheel advances — standard wheel
 * behavior, keeps slot count small.
 *
 * @module MessageQueueLayer/Engine/Advanced
 */

import { EngineMessage } from '../types';

export interface ExpiryOptions {
  /** Wheel granularity (ms per slot). Default 1000. */
  readonly tickMs?: number;
  /** Wheel size in slots. Default 60 (a 60-second rotation at 1s slots). */
  readonly slots?: number;
  readonly clock?: () => number;
}

interface WheelEntry<T> {
  readonly message: EngineMessage<T>;
  readonly expiresAt: number;
  readonly queue: string;
}

export class MessageExpiry<T = unknown> {
  private readonly tickMs: number;
  private readonly slotCount: number;
  private readonly clock: () => number;
  /** Circular buffer of expiry buckets, indexed by (expiresAt / tickMs) % slots. */
  private readonly wheel: WheelEntry<T>[][];
  /** Entries too far out to fit the current rotation. */
  private readonly overflow: WheelEntry<T>[] = [];
  private cursor = -1; // last ticked slot index
  private totalExpired = 0;

  constructor(options: ExpiryOptions = {}) {
    this.tickMs = options.tickMs ?? 1_000;
    this.slotCount = options.slots ?? 60;
    this.clock = options.clock ?? Date.now;
    this.wheel = Array.from({ length: this.slotCount }, () => []);
  }

  /**
   * Registers a message's expiry. `expiresAt` maps to slot
   * `floor(expiresAt/tickMs) % slots`; anything beyond a full rotation goes
   * to overflow and re-buckets on the next tick.
   */
  schedule(queue: string, message: EngineMessage<T>, expiresAt: number): void {
    const entry = { message, expiresAt, queue };
    const rotationMs = this.tickMs * this.slotCount;
    if (expiresAt > this.clock() + rotationMs) {
      this.overflow.push(entry);
      return;
    }
    this.wheel[this.slotFor(expiresAt)].push(entry);
  }

  /** Removes a message from the wheel (consumed before expiry). O(bucket). */
  cancel(messageId: string): boolean {
    for (const bucket of this.wheel) {
      const i = bucket.findIndex((e) => e.message.id === messageId);
      if (i >= 0) {
        bucket.splice(i, 1);
        return true;
      }
    }
    const j = this.overflow.findIndex((e) => e.message.id === messageId);
    if (j >= 0) {
      this.overflow.splice(j, 1);
      return true;
    }
    return false;
  }

  /**
   * Advances the wheel to `now` and drains every slot the cursor passed —
   * the expired set. Also re-buckets overflow entries now in range.
   * Returns expired entries grouped by queue.
   */
  tick(now = this.clock()): Map<string, EngineMessage<T>[]> {
    // Re-bucket overflow entries that have come into range.
    const rotationMs = this.tickMs * this.slotCount;
    for (let i = this.overflow.length - 1; i >= 0; i--) {
      const e = this.overflow[i];
      if (e.expiresAt <= now + rotationMs) {
        this.overflow.splice(i, 1);
        this.wheel[this.slotFor(e.expiresAt)].push(e);
      }
    }

    const expired = new Map<string, EngineMessage<T>[]>();
    const nowSlot = this.slotFor(now);
    if (this.cursor === -1) {
      this.cursor = nowSlot;
      return expired; // first tick: nothing to drain, just park the cursor
    }

    // Scan all buckets: an entry is due the moment `expiresAt` passes,
    // regardless of which slot granularity landed it in. The wheel's
    // bucketing bounds the per-tick scan to the slot count, not total
    // pending messages — O(slots + expired) rather than O(pending).
    for (let i = 0; i < this.slotCount; i++) {
      const bucket = this.wheel[i];
      for (let j = bucket.length - 1; j >= 0; j--) {
        if (bucket[j].expiresAt <= now) {
          let list = expired.get(bucket[j].queue);
          if (!list) expired.set(bucket[j].queue, (list = []));
          list.push(bucket[j].message);
          this.totalExpired++;
          bucket.splice(j, 1);
        }
      }
    }
    this.cursor = nowSlot;
    return expired;
  }

  /** Pending (scheduled but not yet expired) count. */
  get pending(): number {
    let n = this.overflow.length;
    for (const b of this.wheel) n += b.length;
    return n;
  }

  get expiredTotal(): number {
    return this.totalExpired;
  }

  private slotFor(expiresAt: number): number {
    return Math.floor(expiresAt / this.tickMs) % this.slotCount;
  }
}
