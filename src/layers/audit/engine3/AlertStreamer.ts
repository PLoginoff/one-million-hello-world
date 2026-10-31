/**
 * Real-Time Audit Alert Streamer
 *
 * Push-based subscriptions over the sealed-record stream: callers
 * register a filter (compiled once into a fast matcher), then every
 * record passed to `publish()` is tested against all subscriptions in
 * O(S) and delivered to matching listeners.
 *
 * Delivery semantics are **at-most-once, bounded**: each subscription
 * has a small ring buffer of pending alerts (default 256) drained by
 * `drain()` or delivered immediately to a push listener. Overflow is
 * counted in `dropped` rather than blocking the audit pipeline — the
 * audit store is the durable record, the stream is a notification.
 *
 * Filters compile to a single predicate: non-undefined conditions are
 * ANDed; `actors`/`actions`/`outcomes` are Set-membership checks;
 * `actionPrefix` is `startsWith`; `minSeverity` uses the canonical
 * severity ordering.
 *
 * Complexity: subscribe O(1); publish O(S × filter cost) where the
 * filter cost is O(1) after compilation; drain O(pending).
 *
 * @module AuditLayer/Engine3
 */

import type { AuditRecord } from '../engine/types';
import { SEVERITY_ORDER } from '../engine/types';
import {
  Alert,
  AlertFilter,
  AlertListener,
  AlertSubscription,
  AuditClock3,
  SystemAuditClock3,
} from './types3';

/** Compiled filter predicate. */
type Matcher = (r: AuditRecord) => boolean;

/**
 * Compile a declarative filter into one predicate. Compiling once at
 * subscribe time keeps publish hot-path allocation-free.
 */
export function compileFilter(filter: AlertFilter): Matcher {
  const actors = filter.actors ? new Set(filter.actors) : undefined;
  const actions = filter.actions ? new Set(filter.actions) : undefined;
  const outcomes = filter.outcomes ? new Set(filter.outcomes) : undefined;
  const minSev = filter.minSeverity !== undefined ? SEVERITY_ORDER[filter.minSeverity] : undefined;

  return (r) => {
    if (filter.tenant !== undefined && r.tenant !== filter.tenant) return false;
    if (actors !== undefined && !actors.has(r.actor)) return false;
    if (actions !== undefined && !actions.has(r.action)) return false;
    if (filter.actionPrefix !== undefined && !r.action.startsWith(filter.actionPrefix)) return false;
    if (filter.resourceType !== undefined && r.resourceType !== filter.resourceType) return false;
    if (minSev !== undefined && SEVERITY_ORDER[r.severity] < minSev) return false;
    if (outcomes !== undefined && !outcomes.has(r.outcome)) return false;
    return true;
  };
}

interface SubscriptionState {
  sub: AlertSubscription;
  matcher: Matcher;
  listener?: AlertListener;
  /** Ring buffer of undelivered alerts (pull model). */
  pending: Alert[];
  /** Write position in the ring. */
  head: number;
  /** Alerts currently buffered. */
  size: number;
  nextDeliverySeq: number;
}

export interface AlertStreamerOptions {
  readonly clock?: AuditClock3;
  /** Per-subscription pending buffer capacity (default 256). */
  readonly bufferSize?: number;
}

let defaultSubSeq = 0;

export class AuditAlertStreamer {
  private readonly clock: AuditClock3;
  private readonly bufferSize: number;
  private readonly subs = new Map<string, SubscriptionState>();
  private published = 0;
  private matched = 0;

  constructor(options: AlertStreamerOptions = {}) {
    this.clock = options.clock ?? new SystemAuditClock3();
    this.bufferSize = options.bufferSize ?? 256;
    if (this.bufferSize <= 0) throw new Error('bufferSize must be positive');
  }

  /**
   * Register a subscription. With `listener`, matching records push
   * immediately; without it they queue for `drain()`.
   */
  subscribe(filter: AlertFilter, opts: { label?: string; listener?: AlertListener; id?: string } = {}): string {
    const id = opts.id ?? `sub-${++defaultSubSeq}`;
    if (this.subs.has(id)) throw new Error(`subscription ${id} already exists`);
    const sub: AlertSubscription = {
      id,
      filter,
      label: opts.label,
      createdAt: this.clock.now(),
      delivered: 0,
      dropped: 0,
    };
    this.subs.set(id, {
      sub,
      matcher: compileFilter(filter),
      listener: opts.listener,
      pending: new Array<Alert>(this.bufferSize),
      head: 0,
      size: 0,
      nextDeliverySeq: 1,
    });
    return id;
  }

  /** Attach/replace a push listener on an existing subscription. */
  setListener(id: string, listener: AlertListener | undefined): boolean {
    const s = this.subs.get(id);
    if (!s) return false;
    s.listener = listener;
    return true;
  }

  unsubscribe(id: string): boolean {
    return this.subs.delete(id);
  }

  /**
   * Publish one sealed record. Each matching subscription either
   * fires its listener or buffers the alert.
   */
  publish(record: AuditRecord): number {
    this.published++;
    let matches = 0;
    for (const s of this.subs.values()) {
      if (!s.matcher(record)) continue;
      matches++;
      this.matched++;
      const alert: Alert = {
        subscriptionId: s.sub.id,
        record,
        deliverySeq: s.nextDeliverySeq++,
      };
      if (s.listener) {
        s.sub.delivered++;
        s.listener(alert);
      } else if (s.size < this.bufferSize) {
        s.pending[(s.head + s.size) % this.bufferSize] = alert;
        s.size++;
      } else {
        // Buffer full — drop, don't block the pipeline.
        s.sub.dropped++;
      }
    }
    return matches;
  }

  /**
   * Drain buffered alerts for a subscription (pull model). Returns
   * up to `limit` alerts in delivery order; marks them delivered.
   */
  drain(id: string, limit: number = this.bufferSize): readonly Alert[] {
    const s = this.subs.get(id);
    if (!s) return [];
    const out: Alert[] = [];
    const n = Math.min(limit, s.size);
    for (let i = 0; i < n; i++) {
      out.push(s.pending[(s.head + i) % this.bufferSize]!);
    }
    s.head = (s.head + n) % this.bufferSize;
    s.size -= n;
    s.sub.delivered += n;
    return out;
  }

  /** Peek without consuming. */
  pending(id: string): number {
    const s = this.subs.get(id);
    return s?.size ?? 0;
  }

  /** Snapshot a subscription's live counters. */
  subscription(id: string): AlertSubscription | undefined {
    return this.subs.get(id)?.sub;
  }

  /** All subscription snapshots. */
  subscriptions(): readonly AlertSubscription[] {
    return [...this.subs.values()].map((s) => s.sub);
  }

  /** Aggregate counters for the streamer itself. */
  stats(): { published: number; matched: number; subscriptions: number } {
    return { published: this.published, matched: this.matched, subscriptions: this.subs.size };
  }
}

