/**
 * SendQueue — per-connection outbound buffer with backpressure policies.
 *
 * {@link WebSocketSession} already tracks `bufferedAmount`, but its policy
 * is fixed (enqueue → flush → drop over a hard cap). Real servers need
 * richer, per-connection backpressure control: a broadcast to 10k clients
 * must not OOM the process because one client's TCP window stalled.
 *
 * This queue sits *in front of* the session's transport and models the
 * kernel send buffer. Producers call `enqueue`; the queue drains through a
 * {@link SendSink} at its own pace (synchronous sinks drain instantly;
 * socket-backed sinks drain on `drain` events via `notifyWritable`).
 *
 * Three high-watermark policies:
 *
 *  - `drop-newest` — when the next enqueue would exceed `maxBytes`, reject
 *    the incoming message. Good for low-value traffic (typing indicators).
 *  - `drop-oldest` — evict the oldest queued message to make room. Good
 *    for state-sync traffic where only the freshest snapshot matters.
 *  - `close` — exceed `maxBytes` and the connection is considered stuck;
 *    `onPolicyClose` fires so the owner can terminate the session
 *    (close 1008/1011). Good for authenticated high-value streams where a
 *    wedged consumer is worse than none.
 *
 * Below `highWaterMark` everything flows freely. Between HWM and
 * `maxBytes` is the "pressure zone": the queue keeps accepting (latency
 * over loss) but reports `overHighWaterMark` so producers can slow down.
 *
 * `maxMessages` is a second dimension cap — many tiny messages can exhaust
 * memory in per-entry overhead before hitting the byte cap.
 *
 * Complexity: `enqueue`/`drainOne` are O(1) amortized; the queue is a
 * ring buffer so `shift()` costs nothing.
 *
 * @module WebsocketLayer/Server
 */

/** Policy applied when enqueueing would exceed `maxBytes`. */
export enum BackpressurePolicy {
  /** Reject the incoming message; keep everything queued. */
  DROP_NEWEST = 'drop-newest',
  /** Evict oldest queued messages until the new one fits. */
  DROP_OLDEST = 'drop-oldest',
  /** Signal connection termination via `onPolicyClose`. */
  CLOSE = 'close',
}

/** Why a message left the queue without being written. */
export enum DropReason {
  /** DROP_NEWEST rejected the incoming message. */
  CAPACITY = 'capacity',
  /** DROP_OLDEST evicted this queued entry. */
  EVICTED = 'evicted',
  /** CLOSE policy fired; queue was flushed. */
  POLICY_CLOSE = 'policy-close',
  /** `clear()` during shutdown/close. */
  CLEARED = 'cleared',
}

/** One queued outbound unit (already a complete application message). */
export interface QueuedSend {
  /** Opaque payload — the session serializes before enqueueing. */
  readonly payload: Buffer;
  /** Whether the payload should go out as a binary frame. */
  readonly binary: boolean;
  /** Logical byte cost — payload bytes plus per-message overhead. */
  readonly bytes: number;
  /** Enqueue timestamp for queue-delay metrics. */
  readonly enqueuedAt: number;
}

export interface SendQueueOptions {
  /** Soft cap: queue is "under pressure" above this many bytes. */
  readonly highWaterMarkBytes: number;
  /** Hard cap in bytes; policy decides what happens on overflow. */
  readonly maxBytes: number;
  /** Hard cap in message count (per-entry overhead guard). Default ∞. */
  readonly maxMessages?: number;
  readonly policy: BackpressurePolicy;
  /** Per-message byte overhead added to payload size. Default 14 (frame hdr). */
  readonly perMessageOverhead?: number;
  /** Injectable clock. */
  readonly now?: () => number;
  /** Fired when a queued/incoming message is dropped. */
  readonly onDrop?: (entry: QueuedSend, reason: DropReason) => void;
  /** Fired once when the CLOSE policy trips. */
  readonly onPolicyClose?: () => void;
}

/** Aggregate counters for one queue — exposed for dashboards. */
export interface SendQueueStats {
  readonly bufferedBytes: number;
  readonly queuedMessages: number;
  readonly overHighWaterMark: boolean;
  readonly totalEnqueued: number;
  readonly totalSent: number;
  readonly totalDropped: number;
  readonly bytesSent: number;
  readonly bytesDropped: number;
  /** True after the CLOSE policy tripped. */
  readonly closedByPolicy: boolean;
}

/**
 * A call-once-per-flush sink: the queue hands it queued entries; the sink
 * returns true if it accepted the write (socket buffer has room) or false
 * if the transport is momentarily unwritable and the entry should be
 * re-queued at the head.
 */
export type SendSink = (entry: QueuedSend) => boolean;

/**
 * Ring buffer with head index — avoids O(n) `Array.shift` on every drain.
 * Grows by `concat`-style compaction when head wastes >50% of the array.
 */
class RingBuffer<T> {
  private _items: (T | undefined)[] = [];
  private _head = 0;
  private _size = 0;

  get size(): number {
    return this._size;
  }

  push(item: T): void {
    this._items.push(item);
    this._size++;
  }

  peek(): T | undefined {
    return this._items[this._head];
  }

  shift(): T | undefined {
    if (this._size === 0) return undefined;
    const item = this._items[this._head];
    this._items[this._head] = undefined;
    this._head++;
    this._size--;
    // Compact when the dead prefix dominates — keeps memory bounded.
    if (this._head > 64 && this._head * 2 > this._items.length) {
      this._items = this._items.slice(this._head);
      this._head = 0;
    }
    return item;
  }

  /** Remove and return the newest element (for drop-oldest bookkeeping). */
  clear(): T[] {
    const out: T[] = [];
    while (this._size > 0) {
      const item = this.shift();
      if (item !== undefined) out.push(item);
    }
    return out;
  }
}

export class SendQueue {
  private readonly _hwm: number;
  private readonly _maxBytes: number;
  private readonly _maxMessages: number;
  private readonly _policy: BackpressurePolicy;
  private readonly _overhead: number;
  private readonly _now: () => number;
  private readonly _onDrop?: (entry: QueuedSend, reason: DropReason) => void;
  private readonly _onPolicyClose?: () => void;
  private readonly _sink: SendSink;

  private readonly _queue = new RingBuffer<QueuedSend>();
  private _bufferedBytes = 0;
  private _totalEnqueued = 0;
  private _totalSent = 0;
  private _totalDropped = 0;
  private _bytesSent = 0;
  private _bytesDropped = 0;
  private _closedByPolicy = false;

  constructor(sink: SendSink, options: SendQueueOptions) {
    if (options.highWaterMarkBytes < 0 || options.maxBytes <= 0) {
      throw new Error('invalid water marks');
    }
    if (options.maxBytes < options.highWaterMarkBytes) {
      throw new Error('maxBytes must be >= highWaterMarkBytes');
    }
    this._sink = sink;
    this._hwm = options.highWaterMarkBytes;
    this._maxBytes = options.maxBytes;
    this._maxMessages = options.maxMessages ?? Number.POSITIVE_INFINITY;
    this._policy = options.policy;
    this._overhead = options.perMessageOverhead ?? 14;
    this._now = options.now ?? (() => Date.now());
    this._onDrop = options.onDrop;
    this._onPolicyClose = options.onPolicyClose;
  }

  /** Bytes currently queued. */
  get bufferedBytes(): number {
    return this._bufferedBytes;
  }

  /** Messages currently queued. */
  get queuedMessages(): number {
    return this._queue.size;
  }

  /** True in the pressure zone (>= HWM, < policy trip point). */
  get overHighWaterMark(): boolean {
    return this._bufferedBytes >= this._hwm;
  }

  /** True after the CLOSE policy fired. */
  get closedByPolicy(): boolean {
    return this._closedByPolicy;
  }

  /**
   * Enqueue a message for sending. Applies the configured policy when the
   * queue is at capacity. Drains eagerly — a synchronous sink empties the
   * queue inside the call.
   *
   * @returns true when the message was queued-or-sent; false on drop.
   */
  enqueue(payload: Buffer, binary = false): boolean {
    if (this._closedByPolicy) return false;
    const entry: QueuedSend = {
      payload,
      binary,
      bytes: payload.byteLength + this._overhead,
      enqueuedAt: this._now(),
    };

    // Message-count cap — applies before the byte policy.
    if (this._queue.size >= this._maxMessages) {
      if (!this._makeRoomByPolicy(entry)) {
        return false;
      }
    }

    // Byte cap — policy decides whether the new entry gets in.
    if (this._bufferedBytes + entry.bytes > this._maxBytes) {
      if (!this._makeRoomByPolicy(entry)) {
        return false;
      }
    }

    this._queue.push(entry);
    this._bufferedBytes += entry.bytes;
    this._totalEnqueued++;
    this._drain();
    return true;
  }

  /**
   * Called by the transport layer when the socket signals writability
   * (`drain` event). Flushes until the sink declines or queue is empty.
   */
  notifyWritable(): void {
    this._drain();
  }

  /** Drop everything (connection closing). Fires onDrop(CLEARED). */
  clear(): void {
    for (const entry of this._queue.clear()) {
      this._accountDrop(entry, DropReason.CLEARED);
    }
    this._bufferedBytes = 0;
  }

  stats(): SendQueueStats {
    return {
      bufferedBytes: this._bufferedBytes,
      queuedMessages: this._queue.size,
      overHighWaterMark: this.overHighWaterMark,
      totalEnqueued: this._totalEnqueued,
      totalSent: this._totalSent,
      totalDropped: this._totalDropped,
      bytesSent: this._bytesSent,
      bytesDropped: this._bytesDropped,
      closedByPolicy: this._closedByPolicy,
    };
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  /**
   * Try to fit `incoming` under the configured policy.
   * Returns true when the caller should proceed with the push.
   */
  private _makeRoomByPolicy(incoming: QueuedSend): boolean {
    switch (this._policy) {
      case BackpressurePolicy.DROP_NEWEST:
        this._accountDrop(incoming, DropReason.CAPACITY);
        return false;
      case BackpressurePolicy.DROP_OLDEST:
        this._evictUntilFits(incoming);
        // If eviction still can't fit it (single message > maxBytes), drop.
        if (this._bufferedBytes + incoming.bytes > this._maxBytes) {
          this._accountDrop(incoming, DropReason.CAPACITY);
          return false;
        }
        return true;
      case BackpressurePolicy.CLOSE:
        this._tripClosePolicy(incoming);
        return false;
    }
  }

  /** DROP_OLDEST: evict from the head until `incoming` fits. */
  private _evictUntilFits(incoming: QueuedSend): void {
    while (
      this._queue.size > 0 &&
      (this._bufferedBytes + incoming.bytes > this._maxBytes ||
        this._queue.size >= this._maxMessages)
    ) {
      const victim = this._queue.shift();
      if (victim === undefined) break;
      this._bufferedBytes -= victim.bytes;
      this._accountDrop(victim, DropReason.EVICTED);
    }
  }

  /** CLOSE: flush the queue, mark closed, notify owner. */
  private _tripClosePolicy(incoming: QueuedSend): void {
    this._closedByPolicy = true;
    this._accountDrop(incoming, DropReason.POLICY_CLOSE);
    for (const entry of this._queue.clear()) {
      this._accountDrop(entry, DropReason.POLICY_CLOSE);
    }
    this._bufferedBytes = 0;
    this._onPolicyClose?.();
  }

  /** Push entries at the sink until it declines or we run dry. */
  private _drain(): void {
    while (this._queue.size > 0) {
      const head = this._queue.peek();
      if (head === undefined) break;
      if (!this._sink(head)) {
        // Transport unwritable — keep it queued, retry on notifyWritable.
        return;
      }
      this._queue.shift();
      this._bufferedBytes -= head.bytes;
      this._totalSent++;
      this._bytesSent += head.bytes;
    }
  }

  private _accountDrop(entry: QueuedSend, reason: DropReason): void {
    this._totalDropped++;
    this._bytesDropped += entry.bytes;
    this._onDrop?.(entry, reason);
  }
}
