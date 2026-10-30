/**
 * Channel Health Tracker + Broadcast Pacer.
 *
 * `ChannelHealthTracker` — per-channel circuit breaker fed with delivery
 * outcomes. Channels flap independently: if email's provider is down,
 * the breaker opens on email while sms keeps flowing. Three states:
 *
 *   closed  → normal; failures counted on a sliding window
 *   open    → sends short-circuited; half-open probe after cooldown
 *   half-open → one trial send allowed; success closes, failure re-opens
 *
 * `BroadcastPacer` — paces topic fan-out so a broadcast to N users
 * doesn't hammer providers: emits batches of `batchSize` every
 * `intervalMs`, draining the queue oldest-first.
 *
 * @module NotificationLayer/Engine2
 */

import { Channel, Clock, SystemClock } from '../delivery/NotificationTypes';

// ---------------------------------------------------------------------------
// Circuit breaker
// ---------------------------------------------------------------------------

export type BreakerState = 'closed' | 'open' | 'half-open';

export interface BreakerConfig {
  /** Window over which the failure rate is measured. */
  readonly windowMs: number;
  /** Min outcomes in window before the breaker can trip. */
  readonly minSamples: number;
  /** Failure fraction (0..1) that trips the breaker. */
  readonly failureThreshold: number;
  /** How long the breaker stays open before a half-open probe. */
  readonly cooldownMs: number;
}

export const DEFAULT_BREAKER: BreakerConfig = {
  windowMs: 60_000,
  minSamples: 10,
  failureThreshold: 0.5,
  cooldownMs: 30_000,
};

interface Outcome {
  readonly atMs: number;
  readonly failed: boolean;
}

interface ChannelRuntime {
  state: BreakerState;
  /** Sliding window of outcomes (head-pointer deque). */
  outcomes: Outcome[];
  head: number;
  failures: number;
  openedAtMs?: number;
  /** Half-open probe in flight. */
  probeInFlight: boolean;
}

export class ChannelHealthTracker {
  private readonly _config: BreakerConfig;
  private readonly _clock: Clock;
  private readonly _channels = new Map<Channel, ChannelRuntime>();

  constructor(config: Partial<BreakerConfig> = {}, clock: Clock = new SystemClock()) {
    this._config = { ...DEFAULT_BREAKER, ...config };
    this._clock = clock;
  }

  /** Should a send on `channel` proceed? */
  admit(channel: Channel): { allow: boolean; reason?: string } {
    const rt = this._rt(channel);
    const now = this._clock.now();
    this._evict(rt, now);
    // open → half-open transition when the cooldown elapses.
    if (
      rt.state === 'open' &&
      rt.openedAtMs !== undefined &&
      now - rt.openedAtMs >= this._config.cooldownMs
    ) {
      rt.state = 'half-open';
      rt.probeInFlight = false;
    }
    if (rt.state === 'closed') return { allow: true };
    if (rt.state === 'open') return { allow: false, reason: `breaker open on ${channel}` };
    // half-open: exactly one probe in flight.
    if (!rt.probeInFlight) {
      rt.probeInFlight = true;
      return { allow: true, reason: 'half-open probe' };
    }
    return { allow: false, reason: 'half-open probe already in flight' };
  }

  /** Record an outcome. `ok` = the provider accepted the message. */
  record(channel: Channel, ok: boolean): void {
    const rt = this._rt(channel);
    const now = this._clock.now();
    this._evict(rt, now);
    rt.outcomes.push({ atMs: now, failed: !ok });
    if (!ok) rt.failures += 1;

    if (rt.state === 'half-open') {
      rt.probeInFlight = false;
      if (ok) {
        rt.state = 'closed';
        // Clear the failure window so one old spike can't instantly re-trip.
        rt.outcomes = [];
        rt.head = 0;
        rt.failures = 0;
      } else {
        rt.state = 'open';
        rt.openedAtMs = now;
      }
      return;
    }
    if (rt.state !== 'closed') return;
    const total = rt.outcomes.length - rt.head;
    if (total >= this._config.minSamples && rt.failures / total >= this._config.failureThreshold) {
      rt.state = 'open';
      rt.openedAtMs = now;
    }
  }

  state(channel: Channel): BreakerState {
    return this._rt(channel).state;
  }

  /** Windowed failure rate for diagnostics. */
  failureRate(channel: Channel): number {
    const rt = this._rt(channel);
    this._evict(rt, this._clock.now());
    const total = rt.outcomes.length - rt.head;
    return total === 0 ? 0 : rt.failures / total;
  }

  /** Manually reset a channel (operator override). */
  reset(channel: Channel): void {
    const rt = this._rt(channel);
    rt.state = 'closed';
    rt.outcomes = [];
    rt.head = 0;
    rt.failures = 0;
    rt.probeInFlight = false;
    rt.openedAtMs = undefined;
  }

  private _rt(channel: Channel): ChannelRuntime {
    let rt = this._channels.get(channel);
    if (!rt) {
      rt = { state: 'closed', outcomes: [], head: 0, failures: 0, probeInFlight: false };
      this._channels.set(channel, rt);
    }
    return rt;
  }

  /** Drop outcomes older than the sliding window, fixing counters. */
  private _evict(rt: ChannelRuntime, now: number): void {
    const edge = now - this._config.windowMs;
    while (rt.head < rt.outcomes.length && rt.outcomes[rt.head].atMs < edge) {
      if (rt.outcomes[rt.head].failed) rt.failures -= 1;
      rt.head += 1;
    }
    if (rt.head > 256 && rt.head * 2 > rt.outcomes.length) {
      rt.outcomes = rt.outcomes.slice(rt.head);
      rt.head = 0;
    }
  }
}

// ---------------------------------------------------------------------------
// Broadcast pacer
// ---------------------------------------------------------------------------

export interface PacedBatch<T> {
  readonly items: ReadonlyArray<T>;
  readonly batchIndex: number;
  readonly scheduledMs: number;
  readonly remaining: number;
}

export class BroadcastPacer<T> {
  private readonly _batchSize: number;
  private readonly _intervalMs: number;
  private readonly _clock: Clock;
  private readonly _queue: T[] = [];
  private _batchesEmitted = 0;
  private _nextAtMs = 0;

  constructor(batchSize: number, intervalMs: number, clock: Clock = new SystemClock()) {
    if (batchSize <= 0) throw new Error('batchSize must be > 0');
    this._batchSize = batchSize;
    this._intervalMs = intervalMs;
    this._clock = clock;
  }

  /** Enqueue items for paced delivery. */
  enqueue(items: ReadonlyArray<T>): void {
    this._queue.push(...items);
  }

  /**
   * Emit the next batch if the pacing interval has elapsed. Returns
   * undefined when it's too early or the queue is empty.
   */
  drain(): PacedBatch<T> | undefined {
    const now = this._clock.now();
    if (this._queue.length === 0) return undefined;
    if (now < this._nextAtMs) return undefined;
    const items = this._queue.splice(0, this._batchSize);
    this._batchesEmitted += 1;
    this._nextAtMs = now + this._intervalMs;
    return {
      items,
      batchIndex: this._batchesEmitted - 1,
      scheduledMs: now,
      remaining: this._queue.length,
    };
  }

  /** All remaining items in paced batches — for "send the rest now". */
  flushAll(): PacedBatch<T>[] {
    const out: PacedBatch<T>[] = [];
    for (;;) {
      const items = this._queue.splice(0, this._batchSize);
      if (items.length === 0) break;
      out.push({
        items,
        batchIndex: this._batchesEmitted++,
        scheduledMs: this._clock.now(),
        remaining: this._queue.length,
      });
    }
    return out;
  }

  pending(): number {
    return this._queue.length;
  }

  /** Ms until the next batch may go out (0 = ready now). */
  nextBatchInMs(): number {
    if (this._queue.length === 0) return 0;
    return Math.max(this._nextAtMs - this._clock.now(), 0);
  }
}
