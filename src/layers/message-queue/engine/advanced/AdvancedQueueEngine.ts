/**
 * AdvancedQueueEngine — facade composing the operational features.
 *
 * Wires transactions, TTL expiry, quotas, tracing, and preemption around a
 * `BrokerQueue` so a single `enqueue` exercises the whole pipeline:
 *
 *   quota check → stamp trace → enqueue (+ schedule TTL) → record span
 *
 * @module MessageQueueLayer/Engine/Advanced
 */

import { BrokerQueue, BrokerQueueOptions } from '../BrokerQueue';
import { EngineMessage } from '../types';
import { MessageExpiry } from './MessageExpiry';
import { MessageTracer } from './MessageTracer';
import { PreemptingQueue } from './PreemptingQueue';
import { ProducerQuotas, QuotaConfig } from './ProducerQuotas';
import { QueueTransaction, TransactionCoordinator } from './QueueTransaction';
import { StagedSend, TraceContext, TracedMessage } from './types';

/** A leased message plus its trace — what `dequeue` hands the consumer. */
export interface TracedLease<T> extends TracedMessage<T> {
  ack(): void;
  nack(reason?: string): void;
}

export interface AdvancedQueueOptions<T = unknown> extends BrokerQueueOptions {
  readonly quota?: QuotaConfig;
  readonly ttlSlots?: number;
  readonly ttlTickMs?: number;
  /** Enable preempting queue instead of a plain BrokerQueue. */
  readonly inFlightBudget?: number;
}

export class AdvancedQueueEngine<T = unknown> {
  readonly broker: BrokerQueue<T>;
  readonly preempting: PreemptingQueue<T> | null;
  readonly expiry: MessageExpiry<T>;
  readonly quotas: ProducerQuotas;
  readonly tracer: MessageTracer<T>;
  readonly txCoordinator = new TransactionCoordinator();
  private readonly ttlIndex = new Map<string, number>(); // messageId → expiresAt
  private readonly msgProducer = new Map<string, string>(); // messageId → producerId
  private readonly clock: () => number;

  constructor(options: AdvancedQueueOptions<T> = {}) {
    this.clock = options.clock ?? Date.now;
    this.broker = new BrokerQueue<T>(options);
    this.preempting =
      options.inFlightBudget !== undefined
        ? new PreemptingQueue<T>({
            inFlightBudget: options.inFlightBudget,
            clock: this.clock,
          })
        : null;
    this.expiry = new MessageExpiry<T>({
      slots: options.ttlSlots,
      tickMs: options.ttlTickMs,
      clock: this.clock,
    });
    this.quotas = new ProducerQuotas(
      options.quota ?? { defaultMaxInFlight: Number.POSITIVE_INFINITY }
    );
    this.tracer = new MessageTracer<T>({ clock: this.clock });

    // Register the broker as a transaction resource manager.
    const broker = this.broker;
    this.txCoordinator.registerQueue({
      name: 'broker',
      canAccept: (sends) => {
        const depth = broker.depth();
        const headroom = options.highWatermark ?? Number.POSITIVE_INFINITY;
        const need = depth.ready + depth.delayed + sends.length;
        return need <= headroom
          ? { ok: true }
          : { ok: false, reason: `would exceed watermark (${need} > ${headroom})` };
      },
      apply: (sends) => {
        for (const s of sends as readonly StagedSend<T>[]) {
          broker.enqueue(s.payload, {
            priority: s.priority,
            delayMs: s.delayMs,
            headers: s.headers,
          });
        }
      },
    });
  }

  /**
   * Full-pipeline send: quota admission → enqueue → TTL schedule → trace.
   */
  send(
    payload: T,
    opts: {
      priority?: number;
      delayMs?: number;
      ttlMs?: number;
      producerId?: string;
      parent?: TracedMessage<T>;
      headers?: Record<string, string>;
    } = {}
  ): { message: EngineMessage<T>; context: TraceContext } {
    const producerId = opts.producerId ?? 'default';
    if (opts.producerId) this.quotas.assertConsume(producerId);

    const msg = this.broker.enqueue(payload, {
      priority: opts.priority,
      delayMs: opts.delayMs,
      headers: opts.headers,
    });
    (msg as { queue?: string }).queue = 'broker';
    this.msgProducer.set(msg.id, producerId);

    if (opts.ttlMs !== undefined) {
      const expiresAt = this.clock() + opts.ttlMs;
      this.expiry.schedule('broker', msg, expiresAt);
      this.ttlIndex.set(msg.id, expiresAt);
    }
    const context = this.tracer.stamp(msg, opts.parent, producerId);
    return { message: msg, context };
  }

  /** Begins a multi-queue transaction. */
  beginTx(): QueueTransaction<T> {
    return new QueueTransaction<T>();
  }

  /** Commits a transaction through the 2PC coordinator. */
  commitTx(tx: QueueTransaction<T>): void {
    this.txCoordinator.commit(tx);
  }

  /**
   * Runs the expiry wheel: expired messages are removed from the broker's
   * view and recorded as 'expired' in their traces. Returns them.
   */
  tickExpiry(now?: number): Map<string, EngineMessage<T>[]> {
    const expired = this.expiry.tick(now);
    for (const [, msgs] of expired) {
      for (const m of msgs) {
        this.tracer.record(m, 'expired', 'ttl elapsed');
        const pid = this.msgProducer.get(m.id);
        if (pid) this.quotas.release(pid);
        this.ttlIndex.delete(m.id);
      }
    }
    return expired;
  }

  /**
   * Dequeue: leases the next message and wraps it with its trace. The
   * returned object carries the message, its accumulated trace, and
   * `ack`/`nack` that settle the quota + record the outcome span.
   */
  dequeue(): TracedLease<T> | null {
    const lease = this.broker.dequeue();
    if (!lease) return null;
    const msg = lease.message;
    this.expiry.cancel(msg.id); // consumed before TTL — wheel entry is dead
    this.tracer.record(msg, 'dequeued');
    const traced = this.tracer.trace(msg);
    const producerId = this.msgProducer.get(msg.id);
    const self = this;
    return {
      message: msg,
      trace: traced?.trace ?? [],
      context:
        traced?.context ?? { correlationId: 'unknown', enqueuedAt: msg.enqueuedAt },
      ack() {
        self.tracer.record(msg, 'acked');
        if (producerId) self.quotas.release(producerId);
        lease.ack();
      },
      nack(reason?: string) {
        self.tracer.record(msg, 'nacked', reason);
        if (producerId) self.quotas.release(producerId);
        lease.nack(reason);
      },
    };
  }
}
