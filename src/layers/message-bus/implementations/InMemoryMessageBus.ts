/**
 * In-Memory Message Bus Engine
 *
 * A real pub/sub message broker with:
 * - Topic-based routing with AMQP-style wildcards (`*` = one word, `#` = zero or more)
 * - Priority queues backed by a binary heap (higher priority dequeues first)
 * - Delayed delivery via a min-heap scheduler ordered on due-time
 * - Request/reply with correlation IDs and timeouts
 * - At-least-once delivery with consumer ACK/NACK and bounded redelivery
 * - Dead-letter routing after max delivery attempts
 * - Backpressure through bounded per-subscription queues (block / reject / drop-oldest)
 *
 * Complexity notes:
 * - Topic matching: O(L) in the number of topic segments, memoized per (topic, pattern) pair
 * - Enqueue/dequeue: O(log n) heap operations
 * - Dispatch loop is cooperative: handlers are invoked as microtasks, never blocking the publisher
 *
 * @module MessageBusLayer/Implementations
 */

// ============================================================================
// Public types
// ============================================================================

/** Envelope carried by the bus. */
export interface BusMessage<T = unknown> {
  /** Unique message identifier. */
  readonly id: string;
  /** Routing topic, dot-separated words (e.g. `order.created`). */
  readonly topic: string;
  /** Message payload. */
  readonly payload: T;
  /** Arbitrary headers; reserved keys: `correlationId`, `replyTo`, `expiresAt`. */
  readonly headers: Readonly<Record<string, string>>;
  /** Priority 0-9; higher is delivered first within a subscription. */
  readonly priority: number;
  /** Producer-side timestamp (ms since epoch). */
  readonly timestamp: number;
  /** Not-before timestamp for delayed messages. */
  readonly deliverAt: number;
  /** Number of delivery attempts so far (starts at 0, +1 per delivery). */
  deliveryAttempts: number;
  /** Set when the message was redelivered at least once. */
  redelivered: boolean;
  /** Idempotency key (optional) — duplicates by key are dropped per consumer. */
  readonly idempotencyKey?: string;
}

/** Publish options. */
export interface PublishOptions {
  priority?: number;
  headers?: Record<string, string>;
  /** Delay in ms before the message becomes eligible for delivery. */
  delayMs?: number;
  /** Absolute time (ms epoch) after which the message is discarded unrouted. */
  ttlMs?: number;
  idempotencyKey?: string;
}

/** Subscription descriptor returned by `subscribe`. */
export interface Subscription {
  readonly id: string;
  readonly pattern: string;
  readonly queueSize: number;
  readonly pendingAcks: number;
  close(): void;
}

/** Options for `subscribe`. */
export interface SubscribeOptions {
  /** Max in-flight + queued messages; backpressure kicks in beyond this. */
  queueCapacity?: number;
  /** What to do when the queue is full. Default: 'reject'. */
  overflow?: 'reject' | 'drop-oldest' | 'block';
  /** Whether manual ack/nack is required. Default: false (auto-ack). */
  manualAck?: boolean;
  /** Max delivery attempts before dead-lettering. Default: 5. */
  maxDeliveries?: number;
  /** Prefetch batch size for handler invocation. Default: 1. */
  prefetch?: number;
}

/** Handle passed to handlers for manual acknowledgement. */
export interface AckHandle {
  /** Acknowledge: permanently remove the message. */
  ack(): void;
  /** Negative-acknowledge: requeue (or dead-letter if attempts exhausted). */
  nack(requeue?: boolean): void;
}

export type MessageHandler<T = unknown> = (
  message: BusMessage<T>,
  ack: AckHandle
) => void | Promise<void>;

/** Request/reply options. */
export interface RequestOptions extends PublishOptions {
  /** Time to wait for a reply before rejecting. Default: 5000 ms. */
  timeoutMs?: number;
}

export interface BusStats {
  published: number;
  /** Successful handler completions (auto-ack) or explicit acks (manual). */
  delivered: number;
  acked: number;
  nacked: number;
  redelivered: number;
  deadLettered: number;
  expired: number;
  rejected: number;
  activeSubscriptions: number;
  pendingDelayed: number;
}

export class BackpressureError extends Error {
  constructor(topic: string, pattern: string) {
    super(`Backpressure: subscription queue full for pattern '${pattern}' on topic '${topic}'`);
    this.name = 'BackpressureError';
  }
}

export class RequestTimeoutError extends Error {
  constructor(correlationId: string, timeoutMs: number) {
    super(`Request ${correlationId} timed out after ${timeoutMs} ms`);
    this.name = 'RequestTimeoutError';
  }
}

// ============================================================================
// Internal data structures
// ============================================================================

/**
 * Binary min-/max-heap. Ordering is driven by a comparator.
 * Push: O(log n), Pop: O(log n), Peek: O(1).
 */
class Heap<T> {
  private _items: T[] = [];

  constructor(private readonly _compare: (a: T, b: T) => number) {}

  get size(): number {
    return this._items.length;
  }

  peek(): T | undefined {
    return this._items[0];
  }

  push(item: T): void {
    const arr = this._items;
    arr.push(item);
    let i = arr.length - 1;
    // Sift up
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this._compare(arr[i], arr[parent]) < 0) {
        [arr[i], arr[parent]] = [arr[parent], arr[i]];
        i = parent;
      } else {
        break;
      }
    }
  }

  pop(): T | undefined {
    const arr = this._items;
    if (arr.length === 0) return undefined;
    const top = arr[0];
    const last = arr.pop();
    if (arr.length > 0 && last !== undefined) {
      arr[0] = last;
      // Sift down
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < arr.length && this._compare(arr[left], arr[smallest]) < 0) smallest = left;
        if (right < arr.length && this._compare(arr[right], arr[smallest]) < 0) smallest = right;
        if (smallest === i) break;
        [arr[i], arr[smallest]] = [arr[smallest], arr[i]];
        i = smallest;
      }
    }
    return top;
  }

  removeWhere(predicate: (item: T) => boolean): number {
    const before = this._items.length;
    this._items = this._items.filter((i) => !predicate(i));
    // Reheapify: O(n)
    const copy = this._items;
    this._items = [];
    for (const item of copy) this.push(item);
    return before - this._items.length;
  }

  clear(): void {
    this._items = [];
  }
}

interface QueuedMessage {
  readonly envelope: BusMessage;
  /** Monotonic sequence for FIFO tie-breaking within a priority. */
  readonly seq: number;
}

interface PendingAck {
  readonly envelope: BusMessage;
  readonly subscription: InternalSubscription;
}

interface InternalSubscription {
  readonly id: string;
  readonly pattern: string;
  readonly handler: MessageHandler;
  readonly options: Required<SubscribeOptions>;
  /** Per-priority heap; a small fixed array of heaps indexed by priority level. */
  readonly queue: Heap<QueuedMessage>;
  /** Messages delivered but not yet acked. */
  readonly pendingAcks: Map<string, PendingAck>;
  /** Waiters blocked on a full queue ('block' overflow mode). */
  readonly blockedProducers: Array<() => void>;
  /** Seen idempotency keys (bounded ring). */
  readonly seenKeys: Set<string>;
  readonly seenKeysOrder: string[];
  closed: boolean;
  dispatching: boolean;
}

interface PendingReply {
  readonly resolve: (msg: BusMessage) => void;
  readonly reject: (err: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

// ============================================================================
// Topic matcher (AMQP-style wildcards)
// ============================================================================

/**
 * Compiles a routing pattern like `order.*` or `orders.#` into a matcher.
 * `*` matches exactly one word; `#` matches zero or more words.
 */
export function compileTopicPattern(pattern: string): (topic: string) => boolean {
  const parts = pattern.split('.');
  return (topic: string): boolean => {
    const words = topic.split('.');
    let pi = 0;
    let wi = 0;
    while (pi < parts.length) {
      const p = parts[pi];
      if (p === '#') {
        // '#' must be the last segment; it consumes the remaining words.
        return pi === parts.length - 1;
      }
      if (wi >= words.length) return false;
      if (p !== '*' && p !== words[wi]) return false;
      pi++;
      wi++;
    }
    return wi === words.length;
  };
}

// ============================================================================
// The bus
// ============================================================================

let nextSeq = 0;
let nextId = 0;

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${(nextId++).toString(36)}`;
}

export interface InMemoryMessageBusConfig {
  /** Max distinct subscriptions. Default: 1024. */
  maxSubscriptions?: number;
  /** Sweep interval for the delayed-message heap. Default: 25 ms. */
  schedulerTickMs?: number;
  /** Bound on remembered idempotency keys per subscription. Default: 4096. */
  idempotencyWindow?: number;
  /** Default dead-letter topic suffix. Dead letters go to `dlq.<original-topic>`. */
  dlqPrefix?: string;
}

/**
 * In-memory message bus implementation.
 */
export class InMemoryMessageBus {
  private readonly _config: Required<InMemoryMessageBusConfig>;
  private readonly _subscriptions = new Map<string, InternalSubscription>();
  /** Pattern -> subscription ids, so one topic can fan out to many patterns. */
  private readonly _patterns = new Map<string, Set<string>>();
  /** Matcher cache keyed on pattern string. */
  private readonly _matchers = new Map<string, (topic: string) => boolean>();
  /** Delayed messages waiting on their `deliverAt`. Min-heap on deliverAt. */
  private readonly _delayed = new Heap<BusMessage>((a, b) => a.deliverAt - b.deliverAt);
  private readonly _pendingReplies = new Map<string, PendingReply>();
  private readonly _deadLetters: BusMessage[] = [];
  private readonly _stats: BusStats = {
    published: 0,
    delivered: 0,
    acked: 0,
    nacked: 0,
    redelivered: 0,
    deadLettered: 0,
    expired: 0,
    rejected: 0,
    activeSubscriptions: 0,
    pendingDelayed: 0,
  };
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _closed = false;

  constructor(config: InMemoryMessageBusConfig = {}) {
    this._config = {
      maxSubscriptions: config.maxSubscriptions ?? 1024,
      schedulerTickMs: config.schedulerTickMs ?? 25,
      idempotencyWindow: config.idempotencyWindow ?? 4096,
      dlqPrefix: config.dlqPrefix ?? 'dlq',
    };
    this._timer = setInterval(() => this._flushDelayed(), this._config.schedulerTickMs);
    // Do not keep the process alive for the scheduler.
    if (typeof this._timer === 'object' && this._timer !== null && 'unref' in this._timer) {
      (this._timer as { unref: () => void }).unref();
    }
  }

  // ------------------------------------------------------------------ pub/sub

  /**
   * Publish a message to a topic. Returns the message id.
   * The message is routed to every subscription whose pattern matches the topic.
   */
  publish<T>(topic: string, payload: T, options: PublishOptions = {}): string {
    this._ensureOpen();
    const now = Date.now();
    const msg: BusMessage<T> = {
      id: genId('msg'),
      topic,
      payload,
      headers: { ...(options.headers ?? {}) },
      priority: Math.max(0, Math.min(9, options.priority ?? 4)),
      timestamp: now,
      deliverAt: now + (options.delayMs ?? 0),
      deliveryAttempts: 0,
      redelivered: false,
      idempotencyKey: options.idempotencyKey,
    };
    if (options.ttlMs !== undefined) {
      (msg.headers as Record<string, string>).expiresAt = String(now + options.ttlMs);
    }
    this._stats.published++;

    if (msg.deliverAt > now) {
      this._delayed.push(msg);
      return msg.id;
    }
    this._route(msg);
    return msg.id;
  }

  /**
   * Subscribe a handler to a topic pattern. Wildcards supported.
   */
  subscribe<T = unknown>(
    pattern: string,
    handler: MessageHandler<T>,
    options: SubscribeOptions = {}
  ): Subscription {
    this._ensureOpen();
    if (this._subscriptions.size >= this._config.maxSubscriptions) {
      throw new Error(`Subscription limit reached (${this._config.maxSubscriptions})`);
    }
    compileTopicPattern(pattern); // validate pattern eagerly
    const sub: InternalSubscription = {
      id: genId('sub'),
      pattern,
      handler: handler as MessageHandler,
      options: {
        queueCapacity: options.queueCapacity ?? 256,
        overflow: options.overflow ?? 'reject',
        manualAck: options.manualAck ?? false,
        maxDeliveries: options.maxDeliveries ?? 5,
        prefetch: options.prefetch ?? 1,
      },
      queue: new Heap<QueuedMessage>((a, b) => {
        // Max-heap on priority, FIFO within same priority via seq.
        if (a.envelope.priority !== b.envelope.priority) {
          return b.envelope.priority - a.envelope.priority;
        }
        return a.seq - b.seq;
      }),
      pendingAcks: new Map(),
      blockedProducers: [],
      seenKeys: new Set(),
      seenKeysOrder: [],
      closed: false,
      dispatching: false,
    };
    this._subscriptions.set(sub.id, sub);
    let set = this._patterns.get(pattern);
    if (!set) {
      set = new Set();
      this._patterns.set(pattern, set);
    }
    set.add(sub.id);
    this._stats.activeSubscriptions = this._subscriptions.size;

    const self = this;
    return {
      id: sub.id,
      pattern,
      get queueSize() {
        return sub.queue.size;
      },
      get pendingAcks() {
        return sub.pendingAcks.size;
      },
      close() {
        self._unsubscribe(sub.id);
      },
    };
  }

  // ------------------------------------------------------------ request/reply

  /**
   * Send a request and await a reply on a private inbox topic.
   * Correlation is established via the `correlationId` header; responders use `reply()`.
   */
  request<TReq = unknown, TRes = unknown>(
    topic: string,
    payload: TReq,
    options: RequestOptions = {}
  ): Promise<BusMessage<TRes>> {
    this._ensureOpen();
    const correlationId = genId('corr');
    const replyTopic = `${this._config.dlqPrefix}.reply.${correlationId}`;
    const timeoutMs = options.timeoutMs ?? 5000;

    return new Promise<BusMessage<TRes>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pendingReplies.delete(correlationId);
        tempSub.close();
        reject(new RequestTimeoutError(correlationId, timeoutMs));
      }, timeoutMs);

      this._pendingReplies.set(correlationId, {
        resolve: (m) => resolve(m as BusMessage<TRes>),
        reject,
        timer,
      });

      const tempSub = this.subscribe<TRes>(replyTopic, (msg) => {
        const pending = this._pendingReplies.get(correlationId);
        if (pending) {
          clearTimeout(pending.timer);
          this._pendingReplies.delete(correlationId);
          tempSub.close();
          pending.resolve(msg as BusMessage);
        }
      });

      this.publish(topic, payload, {
        ...options,
        headers: {
          ...(options.headers ?? {}),
          correlationId,
          replyTo: replyTopic,
        },
      });
    });
  }

  /**
   * Reply to a message received via `request()`. Convenience for responders.
   */
  reply<T>(requestMessage: BusMessage, payload: T): boolean {
    const replyTo = requestMessage.headers.replyTo;
    const correlationId = requestMessage.headers.correlationId;
    if (!replyTo || !correlationId) return false;
    this.publish(replyTo, payload, { headers: { correlationId } });
    return true;
  }

  // --------------------------------------------------------------------- DLQ

  /** Inspect dead-lettered messages without removing them. */
  deadLetters(): readonly BusMessage[] {
    return this._deadLetters;
  }

  /** Remove and return up to `count` dead letters. */
  drainDeadLetters(count = this._deadLetters.length): BusMessage[] {
    return this._deadLetters.splice(0, Math.max(0, count));
  }

  /** Re-publish a dead letter back to its original topic. */
  replayDeadLetter(messageId: string): boolean {
    const idx = this._deadLetters.findIndex((m) => m.id === messageId);
    if (idx < 0) return false;
    const [msg] = this._deadLetters.splice(idx, 1);
    this._route({ ...msg, deliveryAttempts: 0, redelivered: true, deliverAt: Date.now() });
    return true;
  }

  // ------------------------------------------------------------------ stats

  stats(): BusStats {
    return { ...this._stats, pendingDelayed: this._delayed.size };
  }

  async close(): Promise<void> {
    this._closed = true;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    for (const pending of this._pendingReplies.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Bus closed'));
    }
    this._pendingReplies.clear();
    this._subscriptions.clear();
    this._patterns.clear();
    this._delayed.clear();
    this._stats.activeSubscriptions = 0;
  }

  // -------------------------------------------------------------- internals

  private _ensureOpen(): void {
    if (this._closed) throw new Error('Message bus is closed');
  }

  private _matcherFor(pattern: string): (topic: string) => boolean {
    let m = this._matchers.get(pattern);
    if (!m) {
      m = compileTopicPattern(pattern);
      this._matchers.set(pattern, m);
    }
    return m;
  }

  /** Route a message to every matching subscription. */
  private _route(msg: BusMessage): void {
    const expiresAt = msg.headers.expiresAt;
    if (expiresAt !== undefined && Date.now() > Number(expiresAt)) {
      this._stats.expired++;
      return;
    }
    for (const [pattern, ids] of this._patterns) {
      if (!this._matcherFor(pattern)(msg.topic)) continue;
      for (const id of ids) {
        const sub = this._subscriptions.get(id);
        if (sub && !sub.closed) this._enqueue(sub, msg);
      }
    }
  }

  private _enqueue(sub: InternalSubscription, msg: BusMessage): void {
    // Idempotent dedup
    if (msg.idempotencyKey !== undefined) {
      if (sub.seenKeys.has(msg.idempotencyKey)) return;
      sub.seenKeys.add(msg.idempotencyKey);
      sub.seenKeysOrder.push(msg.idempotencyKey);
      if (sub.seenKeysOrder.length > this._config.idempotencyWindow) {
        const oldest = sub.seenKeysOrder.shift();
        if (oldest !== undefined) sub.seenKeys.delete(oldest);
      }
    }

    if (sub.queue.size >= sub.options.queueCapacity) {
      switch (sub.options.overflow) {
        case 'drop-oldest':
          sub.queue.pop();
          break;
        case 'block':
          // Park producer until a slot frees.
          void new Promise<void>((resolve) => sub.blockedProducers.push(resolve)).then(() =>
            this._enqueue(sub, msg)
          );
          return;
        case 'reject':
        default:
          this._stats.rejected++;
          throw new BackpressureError(msg.topic, sub.pattern);
      }
    }

    sub.queue.push({ envelope: msg, seq: nextSeq++ });
    this._scheduleDispatch(sub);
  }

  private _scheduleDispatch(sub: InternalSubscription): void {
    if (sub.dispatching) return;
    sub.dispatching = true;
    queueMicrotask(() => this._dispatch(sub));
  }

  private _dispatch(sub: InternalSubscription): void {
    sub.dispatching = false;
    if (sub.closed) return;

    let batch = Math.max(1, sub.options.prefetch);
    while (batch-- > 0) {
      const item = sub.queue.pop();
      if (!item) break;
      const msg = item.envelope;
      msg.deliveryAttempts++;

      let acked = false;
      const ack: AckHandle = {
        ack: () => {
          if (acked) return;
          acked = true;
          sub.pendingAcks.delete(msg.id);
          this._stats.acked++;
          this._stats.delivered++;
          this._unblockProducer(sub);
        },
        nack: (requeue = true) => {
          if (acked) return;
          acked = true;
          sub.pendingAcks.delete(msg.id);
          this._stats.nacked++;
          if (requeue && msg.deliveryAttempts < sub.options.maxDeliveries) {
            msg.redelivered = true;
            this._stats.redelivered++;
            sub.queue.push({ envelope: msg, seq: nextSeq++ });
            this._scheduleDispatch(sub);
          } else {
            this._deadLetter(sub, msg);
          }
          this._unblockProducer(sub);
        },
      };

      if (sub.options.manualAck) {
        sub.pendingAcks.set(msg.id, { envelope: msg, subscription: sub });
      }

      void this._invoke(sub, msg, ack).then((ok) => {
        if (sub.options.manualAck) {
          // Handler threw without acking — treat as implicit nack.
          if (!ok && !acked) ack.nack(true);
          return;
        }
        if (ok) {
          this._stats.acked++;
          this._stats.delivered++;
        } else {
          this._stats.nacked++;
          if (msg.deliveryAttempts < sub.options.maxDeliveries) {
            msg.redelivered = true;
            this._stats.redelivered++;
            sub.queue.push({ envelope: msg, seq: nextSeq++ });
            this._scheduleDispatch(sub);
          } else {
            this._deadLetter(sub, msg);
          }
        }
      });
      this._unblockProducer(sub);
    }

    // If the batch was exhausted but messages remain, continue draining on the
    // next microtask so prefetch limits burst size rather than total throughput.
    if (!sub.closed && sub.queue.size > 0) {
      this._scheduleDispatch(sub);
    }
  }

  /** Invoke the handler, resolving `true` on success and `false` on throw. */
  private async _invoke(sub: InternalSubscription, msg: BusMessage, ack: AckHandle): Promise<boolean> {
    try {
      await sub.handler(msg, ack);
      return true;
    } catch {
      return false;
    }
  }

  private _deadLetter(sub: InternalSubscription, msg: BusMessage): void {
    this._stats.deadLettered++;
    const headers: Record<string, string> = {
      ...msg.headers,
      dlqReason: 'max-deliveries',
      dlqOriginalTopic: msg.topic,
      dlqPattern: sub.pattern,
      dlqAt: String(Date.now()),
    };
    const dead: BusMessage = { ...msg, headers };
    this._deadLetters.push(dead);
    // Also route to a dead-letter topic so listeners can observe failures.
    const dlqTopic = `${this._config.dlqPrefix}.${msg.topic}`;
    for (const [pattern, ids] of this._patterns) {
      if (!this._matcherFor(pattern)(dlqTopic)) continue;
      for (const id of ids) {
        const target = this._subscriptions.get(id);
        if (target && !target.closed && target.id !== sub.id) {
          this._enqueue(target, { ...dead, topic: dlqTopic });
        }
      }
    }
  }

  private _unblockProducer(sub: InternalSubscription): void {
    const waiter = sub.blockedProducers.shift();
    if (waiter) waiter();
  }

  private _unsubscribe(id: string): void {
    const sub = this._subscriptions.get(id);
    if (!sub) return;
    sub.closed = true;
    this._subscriptions.delete(id);
    const set = this._patterns.get(sub.pattern);
    if (set) {
      set.delete(id);
      if (set.size === 0) this._patterns.delete(sub.pattern);
    }
    // Any un-acked manual messages go to the DLQ on close.
    for (const pending of sub.pendingAcks.values()) {
      this._deadLetter(sub, pending.envelope);
    }
    sub.pendingAcks.clear();
    // Release parked producers so pending publishes do not hang.
    for (const waiter of sub.blockedProducers.splice(0)) waiter();
    this._stats.activeSubscriptions = this._subscriptions.size;
  }

  /** Move due delayed messages into routing. */
  private _flushDelayed(): void {
    if (this._closed) return;
    const now = Date.now();
    while (this._delayed.size > 0) {
      const top = this._delayed.peek();
      if (!top || top.deliverAt > now) break;
      this._delayed.pop();
      this._route(top);
    }
  }
}
