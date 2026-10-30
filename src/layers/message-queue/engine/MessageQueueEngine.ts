/**
 * MessageQueueEngine — multi-queue facade.
 *
 * Owns a registry of named `BrokerQueue`s (topics) plus shared plumbing:
 * a single clock, id generator, and an aggregate depth/backpressure view.
 * Handlers consume via `work` — a pull loop that dequeues, invokes the
 * handler, and ack/nacks based on the outcome.
 *
 * @module MessageQueueLayer/Engine
 */

import { BrokerQueue, BrokerQueueOptions, DequeueLease } from './BrokerQueue';
import { DepthStats, EngineMessage } from './types';

export interface EngineOptions extends BrokerQueueOptions {}

export class MessageQueueEngine {
  private readonly queues = new Map<string, BrokerQueue<unknown>>();
  private readonly options: BrokerQueueOptions;

  constructor(options: BrokerQueueOptions = {}) {
    this.options = options;
  }

  /** Gets or creates a named queue (topic). */
  queue<T = unknown>(name: string): BrokerQueue<T> {
    let q = this.queues.get(name);
    if (!q) {
      q = new BrokerQueue<unknown>({ ...this.options, name });
      this.queues.set(name, q);
    }
    return q as BrokerQueue<T>;
  }

  names(): string[] {
    return [...this.queues.keys()];
  }

  /** Aggregate depth across all queues — backpressure dashboards. */
  depth(): DepthStats[] {
    return [...this.queues.values()].map((q) => q.depth());
  }

  /** Total pending work across all queues. */
  totalDepth(): number {
    let n = 0;
    for (const q of this.queues.values()) {
      const d = q.depth();
      n += d.ready + d.delayed + d.inFlight;
    }
    return n;
  }

  /**
   * Synchronous pull loop: dequeues up to `max` messages and runs
   * `handler` per message, acking on success and nacking on throw.
   * Returns (processed, failed) counts — the caller decides whether to
   * keep pulling.
   */
  work<T>(
    queueName: string,
    handler: (message: EngineMessage<T>) => void | Promise<void>,
    max = 100
  ): { processed: number; failed: number } {
    const q = this.queue<T>(queueName);
    let processed = 0;
    let failed = 0;
    for (let i = 0; i < max; i++) {
      const lease: DequeueLease<T> | null = q.dequeue();
      if (!lease) break;
      try {
        const r = handler(lease.message);
        // Async handlers can't be awaited in a sync loop — callers wanting
        // async use workAsync. A thenable still counts as "accepted".
        if (r instanceof Promise) {
          r.then(() => lease.ack()).catch(() => lease.nack('handler rejected'));
        } else {
          lease.ack();
        }
        processed++;
      } catch (e) {
        lease.nack(e instanceof Error ? e.message : String(e));
        failed++;
      }
    }
    return { processed, failed };
  }

  /** Async variant — awaits handlers, acking/nacking deterministically. */
  async workAsync<T>(
    queueName: string,
    handler: (message: EngineMessage<T>) => void | Promise<void>,
    max = 100
  ): Promise<{ processed: number; failed: number }> {
    const q = this.queue<T>(queueName);
    let processed = 0;
    let failed = 0;
    for (let i = 0; i < max; i++) {
      const lease = q.dequeue();
      if (!lease) break;
      try {
        await handler(lease.message);
        lease.ack();
        processed++;
      } catch (e) {
        lease.nack(e instanceof Error ? e.message : String(e));
        failed++;
      }
    }
    return { processed, failed };
  }
}
