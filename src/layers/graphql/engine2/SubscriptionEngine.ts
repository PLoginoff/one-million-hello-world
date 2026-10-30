/**
 * Subscription Engine — event-based resolver wiring.
 *
 * GraphQL subscriptions are push-based: `subscription { orderUpdated }`
 * keeps a live stream per client. This engine provides the two halves:
 *
 *  - {@link EventBus}: minimal typed pub/sub. Producers `publish(topic,
 *    payload)`; consumers `subscribe(topic)` get an AsyncIterable that
 *    yields every payload until `unsubscribe`. Backpressure is an
 *    unbounded queue — documented trade-off: GraphQL subscriptions sit
 *    behind websocket backpressure upstream, so an in-process queue is
 *    correct for the resolver layer.
 *  - {@link SubscriptionRegistry}: maps subscription fields → topics +
 *    payload→result mapping, so `orderUpdated` events surface as
 *    properly-shaped subscription payloads, with optional per-
 *    subscriber filtering (subscribe only to `orderUpdated(id: $id)`).
 *
 * AsyncIterable is used because `for await` is the natural consumer for
 * GraphQL subscription resolvers (graphql-js expects AsyncIterable from
 * subscribe()).
 *
 * @module GraphqlLayer/Engine2
 */

/** A payload delivered to a subscriber, tagged with its topic. */
export interface TopicEvent<T = unknown> {
  readonly topic: string;
  readonly payload: T;
  readonly at: number;
}

type QueueSlot = { kind: 'value'; event: TopicEvent } | { kind: 'end' };

/**
 * Push-based async iterable: published events are queued; the consumer's
 * `for await` drains them. Terminates when unsubscribe() is called.
 */
class SubscriptionStream<T> implements AsyncIterable<TopicEvent<T>> {
  private readonly _queue: QueueSlot[] = [];
  private _waiter: ((slot: QueueSlot) => void) | null = null;
  private _done = false;

  /** Called by the bus on publish. */
  push(event: TopicEvent<T>): void {
    if (this._done) return;
    const slot: QueueSlot = { kind: 'value', event: event as TopicEvent };
    if (this._waiter) {
      const w = this._waiter;
      this._waiter = null;
      w(slot);
    } else {
      this._queue.push(slot);
    }
  }

  end(): void {
    if (this._done) return;
    this._done = true;
    const slot: QueueSlot = { kind: 'end' };
    if (this._waiter) {
      const w = this._waiter;
      this._waiter = null;
      w(slot);
    } else {
      this._queue.push(slot);
    }
  }

  get done(): boolean {
    return this._done;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<TopicEvent<T>> {
    while (true) {
      const slot = this._queue.length > 0
        ? this._queue.shift()!
        : await new Promise<QueueSlot>((res) => {
            this._waiter = res;
          });
      if (slot.kind === 'end') return;
      yield slot.event as TopicEvent<T>;
    }
  }
}

export class EventBus {
  private readonly _streams = new Map<string, Set<SubscriptionStream<unknown>>>();
  private readonly _now: () => number;
  private _published = 0;
  private _delivered = 0;

  constructor(now: () => number = Date.now) {
    this._now = now;
  }

  /** Publish to every subscriber of `topic`. Returns deliveries made. */
  publish<T>(topic: string, payload: T): number {
    this._published++;
    const subs = this._streams.get(topic);
    if (!subs || subs.size === 0) return 0;
    const event: TopicEvent<T> = { topic, payload, at: this._now() };
    for (const s of subs) {
      (s as SubscriptionStream<T>).push(event);
      this._delivered++;
    }
    return subs.size;
  }

  /** Subscribe — returns a stream the caller iterates with `for await`. */
  subscribe<T = unknown>(topic: string): SubscriptionStream<T> {
    const stream = new SubscriptionStream<T>();
    let set = this._streams.get(topic);
    if (!set) {
      set = new Set();
      this._streams.set(topic, set);
    }
    set.add(stream as SubscriptionStream<unknown>);
    return stream;
  }

  /** Remove a stream; terminates its iterator. */
  unsubscribe<T>(topic: string, stream: SubscriptionStream<T>): void {
    stream.end();
    const set = this._streams.get(topic);
    if (set) {
      set.delete(stream as SubscriptionStream<unknown>);
      if (set.size === 0) this._streams.delete(topic);
    }
  }

  subscriberCount(topic: string): number {
    return this._streams.get(topic)?.size ?? 0;
  }

  stats(): { published: number; delivered: number; topics: number } {
    return { published: this._published, delivered: this._delivered, topics: this._streams.size };
  }
}

/* ------------------------------------------------------------------ */

/**
 * SubscriptionRegistry: binds GraphQL subscription fields to bus topics
 * and shapes payloads. A binding:
 *
 *   field 'orderUpdated' → topic 'orders.updated'
 *     args → optional topic refinement (id arg → 'orders.updated.42')
 *     filter → drop events that don't match this subscriber's args
 *     map → transform the raw event into the field's return shape
 */
export interface SubscriptionBinding {
  readonly field: string;
  readonly topic: string;
  /** Narrow events for subscribers — e.g. only order id 42. */
  readonly filter?: (args: Record<string, unknown>, payload: unknown) => boolean;
  /** Map raw payload → field result shape (default: identity). */
  readonly map?: (payload: unknown, args: Record<string, unknown>) => unknown;
}

export class SubscriptionRegistry {
  private readonly _bus: EventBus;
  private readonly _bindings = new Map<string, SubscriptionBinding>();

  constructor(bus: EventBus) {
    this._bus = bus;
  }

  bind(binding: SubscriptionBinding): void {
    this._bindings.set(binding.field, binding);
  }

  /**
   * Resolve a subscription field into the AsyncIterable graphql-js-style
   * resolvers return — pre-mapped + pre-filtered per-subscriber args.
   */
  async *subscribe(
    field: string,
    args: Record<string, unknown> = {}
  ): AsyncGenerator<{ [k: string]: unknown }, void, void> {
    const binding = this._bindings.get(field);
    if (!binding) throw new Error(`no subscription binding for field "${field}"`);
    const stream = this._bus.subscribe(binding.topic);
    try {
      for await (const event of stream) {
        if (binding.filter && !binding.filter(args, event.payload)) continue;
        const mapped = binding.map ? binding.map(event.payload, args) : event.payload;
        yield { [field]: mapped };
      }
    } finally {
      this._bus.unsubscribe(binding.topic, stream);
    }
  }

  /** Bound fields. */
  fields(): string[] {
    return [...this._bindings.keys()];
  }
}
