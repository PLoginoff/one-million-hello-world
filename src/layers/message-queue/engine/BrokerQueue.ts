/**
 * BrokerQueue — priority + delayed + at-least-once queue core.
 *
 * Message lifecycle:
 *
 *   enqueue ──► [deliverAt in future?] ──► DelayScheduler ──► promote on due
 *        │                                                        │
 *        └───────────────────────────────────────────────────────►│
 *                                                                 ▼
 *                    ┌─────────◄── nack / visibility-timeout ── ready heap
 *                    │                                            │
 *                  requeue                                   dequeue (lease)
 *                    ▲                                            │
 *                    │                                            ▼
 *              backoff timer                                 inFlight map
 *                    │                                            │
 *                    │                                  ack ──► done
 *                    │                                  nack ─┬─► requeue
 *                    └────────────────────────────────────────┘  └─► DLQ
 *                        (attempts exhausted)
 *
 * Delivery semantics are AT-LEAST-ONCE: `dequeue` leases a message into
 * `inFlight` with a visibility timeout; `ack` removes it; `nack`/`timeout`
 * requeues it (bumping deliveryCount) or dead-letters when the retry
 * policy is exhausted.
 *
 * Backpressure: `enqueue` throws `BackpressureError` when ready+delayed
 * reaches `highWatermark` — the producer sees the pushback instead of the
 * queue growing unboundedly.
 *
 * @module MessageQueueLayer/Engine
 */

import { ConsumerGroups } from './ConsumerGroups';
import { DelayScheduler } from './DelayScheduler';
import { PriorityHeap } from './PriorityHeap';
import {
  BackpressureError,
  DepthStats,
  EngineMessage,
  QueueEngineError,
  RetryPolicy,
  DEFAULT_RETRY_POLICY,
} from './types';

export interface BrokerQueueOptions {
  readonly name?: string;
  readonly retryPolicy?: Partial<RetryPolicy>;
  /** Max ready+delayed depth before `enqueue` throws BackpressureError. */
  readonly highWatermark?: number;
  /** Visibility timeout (ms): leased message auto-requeues if not acked. */
  readonly visibilityTimeoutMs?: number;
  readonly clock?: () => number;
  readonly idGen?: () => string;
}

export interface DequeueLease<T = unknown> {
  readonly message: EngineMessage<T>;
  /** Ack: message fully processed — removed permanently. */
  ack(): void;
  /** Nack: processing failed — requeue with backoff or dead-letter. */
  nack(reason?: string): void;
}

interface InFlightEntry<T = unknown> {
  readonly message: EngineMessage<T>;
  /** When the lease expires and the message requeues. */
  readonly leaseExpiresAt: number;
  readonly leaseId: number;
}

export class BrokerQueue<T = unknown> {
  readonly name: string;
  readonly policy: RetryPolicy;
  private readonly ready = new PriorityHeap<EngineMessage<T>>();
  private readonly delayed = new DelayScheduler<EngineMessage<T>>();
  private readonly inFlight = new Map<string, InFlightEntry<T>>();
  private readonly deadLetter: EngineMessage<T>[] = [];
  private readonly groups = new ConsumerGroups();
  private readonly clock: () => number;
  private readonly idGen: () => string;
  private readonly highWatermark: number;
  private readonly visibilityTimeoutMs: number;
  private seq = 0;
  private leaseSeq = 0;
  private totalDelivered = 0;

  constructor(options: BrokerQueueOptions = {}) {
    this.name = options.name ?? 'queue';
    this.policy = { ...DEFAULT_RETRY_POLICY, ...options.retryPolicy };
    this.clock = options.clock ?? Date.now;
    this.highWatermark = options.highWatermark ?? Number.POSITIVE_INFINITY;
    this.visibilityTimeoutMs = options.visibilityTimeoutMs ?? 30_000;
    let c = 0;
    this.idGen = options.idGen ?? (() => `msg-${this.name}-${c++}`);
  }

  /** Consumer-group view of this queue. */
  get consumerGroups(): ConsumerGroups {
    return this.groups;
  }

  // ------------------------------------------------------------------------
  // Producer
  // ------------------------------------------------------------------------

  /**
   * Enqueues a message.
   *
   * @param delayMs  deliver no earlier than `clock() + delayMs`.
   * @throws BackpressureError when depth >= highWatermark.
   */
  enqueue(
    payload: T,
    options: { priority?: number; delayMs?: number; headers?: Record<string, string> } = {}
  ): EngineMessage<T> {
    const depth = this.ready.size + this.delayed.size;
    if (depth >= this.highWatermark) {
      throw new BackpressureError(this.name, depth, this.highWatermark);
    }
    const msg: EngineMessage<T> = {
      id: this.idGen(),
      payload,
      priority: options.priority ?? 0,
      seq: this.seq++,
      deliverAt: this.clock() + (options.delayMs ?? 0),
      deliveryCount: 0,
      enqueuedAt: this.clock(),
      visibleAt: 0,
      headers: options.headers ?? {},
    };
    if (msg.deliverAt > this.clock()) this.delayed.schedule(msg, msg.deliverAt);
    else this.ready.push(msg, msg.priority, msg.seq);
    return msg;
  }

  // ------------------------------------------------------------------------
  // Consumer — at-least-once lease
  // ------------------------------------------------------------------------

  /**
   * Dequeues the next ready message, moving it to in-flight with a
   * visibility lease. Returns null when nothing is due.
   *
   * First promotes any delayed messages that have come due — the pull
   * model keeps the scheduler lazy (no timers to dispose).
   */
  dequeue(): DequeueLease<T> | null {
    this.promoteDelayed();
    const msg = this.ready.pop();
    if (!msg) return null;
    msg.deliveryCount++;
    this.totalDelivered++;
    const leaseId = this.leaseSeq++;
    this.inFlight.set(msg.id, {
      message: msg,
      leaseExpiresAt: this.clock() + this.visibilityTimeoutMs,
      leaseId,
    });
    const self = this;
    return {
      message: msg,
      ack() {
        self.ack(msg.id, leaseId);
      },
      nack(reason?: string) {
        self.nack(msg.id, leaseId, reason);
      },
    };
  }

  /** Acknowledges a leased message (idempotent on stale lease ids). */
  ack(id: string, leaseId?: number): boolean {
    const entry = this.inFlight.get(id);
    if (!entry) return false;
    if (leaseId !== undefined && entry.leaseId !== leaseId) return false;
    this.inFlight.delete(id);
    return true;
  }

  /**
   * Negative ack: requeue (after backoff) or dead-letter when the retry
   * policy is exhausted. `immediateRedeliveryOnNack` skips the wait.
   */
  nack(id: string, leaseId?: number, reason?: string): void {
    const entry = this.inFlight.get(id);
    if (!entry) return;
    if (leaseId !== undefined && entry.leaseId !== leaseId) return;
    this.inFlight.delete(id);
    const msg = entry.message;
    if (msg.deliveryCount >= this.policy.maxAttempts) {
      this.deadLetter.push(msg);
      void reason;
      return;
    }
    if (this.policy.immediateRedeliveryOnNack) {
      this.ready.push(msg, msg.priority, msg.seq);
      return;
    }
    const delay = this.backoffFor(msg.deliveryCount);
    this.delayed.schedule(msg, this.clock() + delay);
  }

  /**
   * Requeues in-flight messages whose visibility lease expired — the
   * at-least-once recovery path when a consumer crashes mid-processing.
   * Returns the requeued messages.
   */
  requeueExpired(now = this.clock()): EngineMessage<T>[] {
    const expired: EngineMessage<T>[] = [];
    for (const [id, entry] of [...this.inFlight]) {
      if (entry.leaseExpiresAt <= now) {
        this.inFlight.delete(id);
        const msg = entry.message;
        if (msg.deliveryCount >= this.policy.maxAttempts) this.deadLetter.push(msg);
        else {
          this.delayed.schedule(msg, now + this.backoffFor(msg.deliveryCount));
          expired.push(msg);
        }
      }
    }
    return expired;
  }

  /**
   * Pulls a ready message for a consumer group — the group-offset view of
   * the log: fetches by seq position rather than popping the heap.
   * Used by consumers that manage their own ordering progress.
   */
  fetchForGroup(group: string, maxMessages = 1): EngineMessage<T>[] {
    this.promoteDelayed();
    const off = this.groups.join(this.name, group);
    const out: EngineMessage<T>[] = [];
    // Group fetch walks the ready heap in seq order conceptually; we
    // snapshot, order by seq, and take entries at/after position.
    const candidates = this.ready
      .toArray()
      .filter((m) => m.seq >= off.position)
      .sort((a, b) => a.seq - b.seq);
    for (const m of candidates.slice(0, maxMessages)) {
      this.ready.remove((x) => x.id === m.id);
      m.deliveryCount++;
      this.totalDelivered++;
      this.groups.fetchMark(this.name, group, m.seq);
      out.push(m);
    }
    return out;
  }

  /** Commits a group's processed watermark. */
  commitGroup(group: string, seq: number): void {
    this.groups.join(this.name, group); // ensure exists
    this.groups.commit(this.name, group, seq);
  }

  // ------------------------------------------------------------------------
  // Dead letter + stats
  // ------------------------------------------------------------------------

  deadLettered(): readonly EngineMessage<T>[] {
    return this.deadLetter;
  }

  /** Re-enqueues a dead-lettered message for another attempt. */
  requeueDeadLetter(id: string): boolean {
    const i = this.deadLetter.findIndex((m) => m.id === id);
    if (i < 0) return false;
    const msg = this.deadLetter.splice(i, 1)[0];
    msg.deliveryCount = 0;
    this.ready.push(msg, msg.priority, msg.seq);
    return true;
  }

  depth(): DepthStats {
    let oldest = 0;
    const now = this.clock();
    for (const m of this.ready.toArray()) {
      oldest = Math.max(oldest, now - m.enqueuedAt);
    }
    return {
      queue: this.name,
      ready: this.ready.size,
      delayed: this.delayed.size,
      inFlight: this.inFlight.size,
      deadLettered: this.deadLetter.length,
      totalDelivered: this.totalDelivered,
      totalDeadLettered: this.deadLetter.length,
      oldestAgeMs: oldest,
    };
  }

  /** Moves due delayed messages into the ready heap. */
  promoteDelayed(now = this.clock()): number {
    const due = this.delayed.collectDue(now);
    for (const m of due) this.ready.push(m, m.priority, m.seq);
    return due.length;
  }

  private backoffFor(deliveryCount: number): number {
    const p = this.policy;
    const raw = p.backoffBaseMs * Math.pow(p.backoffFactor, Math.max(0, deliveryCount - 1));
    return Math.min(raw, p.backoffMaxMs);
  }
}

/** Validation helper used by the engine facade. */
export function requireQueue<T>(q: BrokerQueue<T> | undefined, name: string): BrokerQueue<T> {
  if (!q) throw new QueueEngineError(`Unknown queue "${name}"`);
  return q;
}
