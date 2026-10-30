/**
 * Bus Topology Manager
 *
 * Declarative exchange/queue/binding registry with in-memory queue
 * storage — the control-plane half of an AMQP-style broker.
 *
 * Semantics per exchange kind:
 *   - `direct`  — routing key must equal bind key exactly.
 *   - `topic`   — bind key is a topic pattern (`*`/`#` wildcards).
 *   - `fanout`  — every bound queue receives a copy; bind key ignored.
 *   - `headers` — all `headerArgs` predicates must hold (x-match=all).
 *
 * A `fanout` publish is O(B) bound queues; `direct`/`topic` evaluate each
 * binding once — O(B) regex tests, patterns pre-compiled at `bind()` time.
 * Cycle safety: exchanges do not forward to other exchanges in this model
 * (queue-only destinations), so delivery cannot loop.
 *
 * @module MessageBusLayer/Engine2
 */

import {
  Binding,
  BusClock2,
  ExchangeDecl,
  ExchangeKind,
  QueuedMessage,
  QueueDecl,
  RoutedMessage,
  SystemBusClock2,
  TopologySnapshot,
} from './types';
import { compileTopicPattern } from './RoutingTable';
import type { HeaderPredicate } from './types';

export class TopologyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TopologyError';
  }
}

interface ExchangeNode {
  name: string;
  kind: ExchangeKind;
  durable: boolean;
  /** queue → compiled binding. */
  bindings: Map<string, CompiledBinding>;
}

interface CompiledBinding {
  readonly spec: Binding;
  /** Present for topic bindings. */
  readonly topicRegex?: RegExp;
  /** Pre-compiled header matchers for `headers` exchanges. */
  readonly headerPredicates: readonly CompiledHeaderPredicate[];
}

interface CompiledHeaderPredicate {
  readonly spec: HeaderPredicate;
  readonly regex?: RegExp;
  readonly valueSet?: ReadonlySet<string>;
}

interface QueueNode {
  name: string;
  durable: boolean;
  maxLength: number | undefined;
  /** FIFO storage. Array + head index — O(1) dequeue amortised. */
  messages: QueuedMessage[];
  head: number;
  /** Monotonic per-queue sequence for lag watermarks. */
  sequence: number;
  /** Messages dropped due to maxLength overflow. */
  dropped: number;
}

let nextMessageId = 0;
function messageId(): string {
  return `m${++nextMessageId}`;
}

/** Reset the id counter — used by tests to keep ids deterministic. */
export function _resetMessageIds(): void {
  nextMessageId = 0;
}

export class BusTopology {
  private readonly _clock: BusClock2;
  private readonly _exchanges = new Map<string, ExchangeNode>();
  private readonly _queues = new Map<string, QueueNode>();

  constructor(clock: BusClock2 = new SystemBusClock2()) {
    this._clock = clock;
  }

  // -- Declaration ----------------------------------------------------

  declareExchange(name: string, kind: ExchangeKind, durable = true): void {
    if (this._exchanges.has(name)) {
      const ex = this._exchanges.get(name);
      if (ex !== undefined && ex.kind !== kind) {
        throw new TopologyError(
          `exchange '${name}' already declared as '${ex.kind}'`
        );
      }
      return; // idempotent redeclare
    }
    this._exchanges.set(name, { name, kind, durable, bindings: new Map() });
  }

  declareQueue(name: string, opts?: { durable?: boolean; maxLength?: number }): void {
    if (this._queues.has(name)) return; // idempotent
    this._queues.set(name, {
      name,
      durable: opts?.durable ?? true,
      maxLength: opts?.maxLength,
      messages: [],
      head: 0,
      sequence: 0,
      dropped: 0,
    });
  }

  deleteExchange(name: string): boolean {
    return this._exchanges.delete(name);
  }

  deleteQueue(name: string): boolean {
    for (const ex of this._exchanges.values()) ex.bindings.delete(name);
    return this._queues.delete(name);
  }

  // -- Bindings ---------------------------------------------------------

  bind(exchange: string, binding: Binding): void {
    const ex = this._requireExchange(exchange);
    this._requireQueue(binding.queue);
    const compiled: CompiledBinding = {
      spec: binding,
      topicRegex: ex.kind === 'topic' ? compileTopicPattern(binding.bindKey) : undefined,
      headerPredicates: binding.headerArgs.map(compileHeaderPredicate),
    };
    ex.bindings.set(binding.queue, compiled);
  }

  unbind(exchange: string, queue: string): boolean {
    const ex = this._exchanges.get(exchange);
    if (!ex) return false;
    return ex.bindings.delete(queue);
  }

  // -- Delivery ---------------------------------------------------------

  /**
   * Route one message to all matching bound queues. Returns the queue
   * names that received a copy; an empty array is an unrouted publish
   * (callers may map it to a return-to-sender or dead-letter flow).
   */
  publish(exchange: string, message: RoutedMessage): string[] {
    const ex = this._requireExchange(exchange);
    const delivered: string[] = [];
    for (const b of ex.bindings.values()) {
      if (!this._matches(ex, b, message)) continue;
      this._enqueue(b.spec.queue, exchange, message);
      delivered.push(b.spec.queue);
    }
    return delivered;
  }

  // -- Consumption ------------------------------------------------------

  /** Peek length (live messages only). */
  queueDepth(queue: string): number {
    const q = this._requireQueue(queue);
    return q.messages.length - q.head;
  }

  /**
   * Remove and return up to `n` messages FIFO. The head index advances;
   * storage is compacted once the consumed prefix exceeds half the
   * array so repeated dequeue stays amortised O(1).
   */
  dequeue(queue: string, n = 1): QueuedMessage[] {
    const q = this._requireQueue(queue);
    const out: QueuedMessage[] = [];
    while (out.length < n && q.head < q.messages.length) {
      const m = q.messages[q.head];
      if (m !== undefined) out.push(m);
      q.head++;
    }
    if (q.head > 64 && q.head * 2 > q.messages.length) {
      q.messages.splice(0, q.head);
      q.head = 0;
    }
    return out;
  }

  /**
   * Nack-with-requeue: rewind the head cursor by up to `n` positions so
   * the most recently dequeued messages become live again, ahead of
   * anything still queued (AMQP requeue semantics). Returns the
   * messages that went back.
   */
  requeue(queue: string, n = 1): QueuedMessage[] {
    const q = this._requireQueue(queue);
    const take = Math.min(n, q.head);
    q.head -= take;
    return q.messages.slice(q.head, q.head + take);
  }

  /** Peek without consuming — used by lag tracking and tests. */
  peek(queue: string, n = 16): readonly QueuedMessage[] {
    const q = this._requireQueue(queue);
    return q.messages.slice(q.head, q.head + n);
  }

  /** Per-queue sequence number (high-watermark for lag). */
  queueSequence(queue: string): number {
    return this._requireQueue(queue).sequence;
  }

  queueDropped(queue: string): number {
    return this._requireQueue(queue).dropped;
  }

  // -- Introspection ----------------------------------------------------

  hasExchange(name: string): boolean {
    return this._exchanges.has(name);
  }

  hasQueue(name: string): boolean {
    return this._queues.has(name);
  }

  /** Point-in-time declaration snapshot (checkpointing / restore). */
  snapshot(): TopologySnapshot {
    const exchanges = [...this._exchanges.values()].map((ex) => ({
      name: ex.name,
      kind: ex.kind,
      durable: ex.durable,
      bindings: [...ex.bindings.values()].map((b) => ({
        ...b.spec,
        exchange: ex.name,
      })),
    }));
    const queues = [...this._queues.values()].map((q) => ({
      name: q.name,
      durable: q.durable,
      maxLength: q.maxLength,
    }));
    return { exchanges, queues };
  }

  /** Re-declare from a snapshot; existing entities are left intact. */
  restore(snap: TopologySnapshot): void {
    for (const q of snap.queues) {
      this.declareQueue(q.name, { durable: q.durable, maxLength: q.maxLength });
    }
    for (const ex of snap.exchanges) {
      this.declareExchange(ex.name, ex.kind, ex.durable);
      for (const b of ex.bindings) {
        this.bind(ex.name, { queue: b.queue, bindKey: b.bindKey, headerArgs: b.headerArgs });
      }
    }
  }

  // -- Internals ----------------------------------------------------------

  private _matches(ex: ExchangeNode, b: CompiledBinding, m: RoutedMessage): boolean {
    switch (ex.kind) {
      case 'fanout':
        return true;
      case 'direct':
        return m.routingKey === b.spec.bindKey;
      case 'topic':
        return b.topicRegex !== undefined && b.topicRegex.test(m.routingKey);
      case 'headers':
        return b.headerPredicates.every((p) => evalHeaderPredicate(p, m.headers));
    }
  }

  private _enqueue(queue: string, exchange: string, message: RoutedMessage): void {
    const q = this._requireQueue(queue);
    if (q.maxLength !== undefined && q.messages.length - q.head >= q.maxLength) {
      // Drop the oldest live message to honour the cap.
      q.head++;
      q.dropped++;
    }
    q.sequence++;
    q.messages.push({
      id: messageId(),
      enqueuedAt: this._clock.now(),
      exchange,
      queue,
      message,
    });
  }

  private _requireExchange(name: string): ExchangeNode {
    const ex = this._exchanges.get(name);
    if (!ex) throw new TopologyError(`unknown exchange '${name}'`);
    return ex;
  }

  private _requireQueue(name: string): QueueNode {
    const q = this._queues.get(name);
    if (!q) throw new TopologyError(`unknown queue '${name}'`);
    return q;
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compileHeaderPredicate(p: HeaderPredicate): CompiledHeaderPredicate {
  if (p.kind === 'match') {
    const out: string[] = ['^'];
    for (const ch of p.pattern) {
      if (ch === '*') out.push('.*');
      else if (ch === '?') out.push('.');
      else out.push(escapeRegExp(ch));
    }
    out.push('$');
    return { spec: p, regex: new RegExp(out.join('')) };
  }
  if (p.kind === 'in') {
    return { spec: p, valueSet: new Set(p.values) };
  }
  return { spec: p };
}

function evalHeaderPredicate(
  p: CompiledHeaderPredicate,
  headers: Readonly<Record<string, string>>
): boolean {
  const spec = p.spec;
  const v = headers[spec.header];
  switch (spec.kind) {
    case 'exists':
      return v !== undefined;
    case 'equals':
      return v === spec.value;
    case 'match':
      return v !== undefined && p.regex !== undefined && p.regex.test(v);
    case 'in':
      return v !== undefined && p.valueSet !== undefined && p.valueSet.has(v);
  }
}
