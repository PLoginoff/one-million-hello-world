/**
 * MessageBus Engine2 — Shared Types
 *
 * Second-generation message-bus primitives: content-based routing tables
 * with compiled pattern matching, declarative bus topology (exchanges,
 * queues, bindings), message schema versioning with on-consume upcasting,
 * atomic multi-message bus transactions, and per-consumer lag tracking.
 *
 * Everything is in-memory; time is injected so windowed metrics are
 * deterministic under test.
 *
 * @module MessageBusLayer/Engine2
 */

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------

/** Injectable clock for lag windows, transactions, and metrics. */
export interface BusClock2 {
  now(): number;
}

export class SystemBusClock2 implements BusClock2 {
  now(): number {
    return Date.now();
  }
}

/** Test clock with manual control. */
export class ManualBusClock2 implements BusClock2 {
  private _t: number;
  constructor(start: number = 0) {
    this._t = start;
  }
  now(): number {
    return this._t;
  }
  advance(ms: number): void {
    this._t += ms;
  }
  set(ms: number): void {
    this._t = ms;
  }
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/**
 * An envelope as seen by the routing engine. `headers` are string-typed
 * because real transports (AMQP, Kafka, SQS) all carry string headers;
 * typed payloads stay in `payload` and are never inspected by routing —
 * only by the versioning upcaster.
 */
export interface RoutedMessage {
  /** Routing key the publisher supplied, e.g. `orders.eu.created`. */
  readonly routingKey: string;
  /** String headers — content-based routing evaluates these. */
  readonly headers: Readonly<Record<string, string>>;
  /** Opaque payload; routing must not depend on it. */
  readonly payload: unknown;
  /** Schema version tag; absent means version 1. */
  readonly schemaVersion?: number;
}

/** A message plus provenance, stored inside a queue. */
export interface QueuedMessage {
  readonly id: string;
  readonly enqueuedAt: number;
  /** Exchange the message entered through. */
  readonly exchange: string;
  /** Queue this copy landed in. */
  readonly queue: string;
  readonly message: RoutedMessage;
}

// ---------------------------------------------------------------------------
// Content-based routing
// ---------------------------------------------------------------------------

/**
 * One predicate on a message header. String comparisons are exact by
 * default; `match` enables `*` and `?` globbing compiled to a regex once
 * at rule registration time.
 */
export type HeaderPredicate =
  | { readonly kind: 'equals'; readonly header: string; readonly value: string }
  | { readonly kind: 'exists'; readonly header: string }
  | {
      readonly kind: 'match';
      readonly header: string;
      readonly pattern: string;
    }
  | { readonly kind: 'in'; readonly header: string; readonly values: readonly string[] };

/**
 * A routing-table row. A message matches when its routing key matches
 * `keyPattern` (topic syntax: `*` = one word, `#` = zero or more words)
 * AND every predicate holds. First match wins — routes are ordered by
 * `priority` (lower number = earlier evaluation).
 */
export interface RoutingRule {
  readonly id: string;
  /** Topic pattern, e.g. `orders.#` or `*.critical`. */
  readonly keyPattern: string;
  /** Destination queue name. */
  readonly queue: string;
  readonly predicates: readonly HeaderPredicate[];
  /** Lower = evaluated first. Ties preserve insertion order. */
  readonly priority: number;
}

export interface RouteDecision {
  readonly ruleId: string;
  readonly queue: string;
}

// ---------------------------------------------------------------------------
// Topology
// ---------------------------------------------------------------------------

export type ExchangeKind = 'direct' | 'topic' | 'fanout' | 'headers';

/**
 * Bind keys use AMQP topic syntax for `topic` exchanges; for `direct`
 * exchanges the key must equal the routing key; `fanout` ignores keys;
 * `headers` exchanges evaluate `headerArgs` predicates instead.
 */
export interface Binding {
  readonly queue: string;
  readonly bindKey: string;
  readonly headerArgs: readonly HeaderPredicate[];
}

export interface ExchangeDecl {
  readonly name: string;
  readonly kind: ExchangeKind;
  /** Durable exchanges survive `snapshot()`/`restore()` only. */
  readonly durable: boolean;
  readonly bindings: ReadonlyMap<string, Binding>;
}

export interface QueueDecl {
  readonly name: string;
  readonly durable: boolean;
  /** Optional cap; enqueueing past it drops the oldest message. */
  readonly maxLength?: number;
}

export interface TopologySnapshot {
  readonly exchanges: ReadonlyArray<{
    readonly name: string;
    readonly kind: ExchangeKind;
    readonly durable: boolean;
    readonly bindings: ReadonlyArray<Binding & { readonly exchange: string }>;
  }>;
  readonly queues: ReadonlyArray<QueueDecl>;
}

// ---------------------------------------------------------------------------
// Versioning / upcasting
// ---------------------------------------------------------------------------

/**
 * An upcaster rewrites a payload of version `from` into version `to`.
 * Steps must be adjacent (v→v+1) and are chained by the upcast chain.
 */
export interface UpcastStep<TFrom = unknown, TTo = unknown> {
  readonly messageType: string;
  readonly from: number;
  readonly to: number;
  upcast(payload: TFrom): TTo;
}

export interface VersionedPayload {
  readonly version: number;
  readonly payload: unknown;
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export type TxStatus = 'open' | 'committed' | 'rolledback';

export interface TxSend {
  readonly exchange: string;
  readonly message: RoutedMessage;
}

export interface TransactionOutcome {
  readonly txId: string;
  readonly status: TxStatus;
  /** Queues that received copies when committed. */
  readonly delivered: ReadonlyArray<{ readonly queue: string; readonly messageId: string }>;
}

// ---------------------------------------------------------------------------
// Consumer lag
// ---------------------------------------------------------------------------

export interface LagSample {
  readonly at: number;
  /** Sequence number of the last enqueued message on the queue. */
  readonly highWatermark: number;
  /** Consumer's committed offset. */
  readonly committed: number;
  /** highWatermark - committed. */
  readonly lag: number;
}

export interface LagReport {
  readonly consumer: string;
  readonly queue: string;
  readonly currentLag: number;
  /** Mean lag over the retained window. */
  readonly avgLag: number;
  /** Maximum lag seen in the retained window. */
  readonly maxLag: number;
  /**
   * Estimated drain rate in messages/ms computed from committed-offset
   * regression over the window; null when fewer than 2 samples exist.
   */
  readonly drainRatePerMs: number | null;
  /**
   * Projected ms until lag reaches zero at the current drain rate;
   * null when the rate is unknown or non-positive.
   */
  readonly etaMs: number | null;
}
