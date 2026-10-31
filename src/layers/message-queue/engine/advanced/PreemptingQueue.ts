/**
 * PreemptingQueue — priority preemption under a bounded in-flight budget.
 *
 * A plain priority queue orders the READY heap correctly, but once a batch
 * of low-priority messages is leased out and the queue hits its in-flight
 * cap, a newly arrived CRITICAL message still waits behind them. Real
 * systems fix this two ways: reserve capacity for high-priority work, or
 * PREEMPT — take back a low-priority lease so the urgent message goes now.
 *
 * This queue implements lease preemption:
 *
 *   enqueue(msg):
 *     if inFlight < budget → normal dequeue path
 *     else if msg.priority > lowest-priority in-flight lease → preempt:
 *         the lowest-priority leased message is pulled back to the ready
 *         heap (bumped seq so it re-dispatches first in its class), and
 *         the budget slot goes to the preemptor
 *
 * Starvation guard: a preempted message's deliveryCount does NOT increase
 * (it never reached a consumer) but it gets ONE grace re-lease before it
 * can be preempted again — otherwise a stream of criticals would starve
 * the same low message forever. `preemptedCount` tracks how often each
 * message lost its lease; a message with `grace > maxPreemptions` is
 * preempt-proof for the rest of its life.
 *
 * @module MessageQueueLayer/Engine/Advanced
 */

import { PriorityHeap } from '../PriorityHeap';
import { EngineMessage } from '../types';

export interface PreemptingQueueOptions {
  /** Max concurrent leases (the resource budget high-priority steals). */
  readonly inFlightBudget: number;
  /** Max times a message may be preempted before it becomes immune. */
  readonly maxPreemptions?: number;
  readonly clock?: () => number;
}

interface Lease<T> {
  readonly message: EngineMessage<T>;
  preemptedCount: number;
  readonly leasedAt: number;
}

export class PreemptingQueue<T = unknown> {
  private readonly ready = new PriorityHeap<EngineMessage<T>>();
  private readonly inFlight = new Map<string, Lease<T>>();
  private readonly budget: number;
  private readonly maxPreemptions: number;
  private readonly clock: () => number;
  private seq = 0;
  private totalPreemptions = 0;

  constructor(options: PreemptingQueueOptions) {
    this.budget = options.inFlightBudget;
    this.maxPreemptions = options.maxPreemptions ?? 3;
    this.clock = options.clock ?? Date.now;
  }

  /**
   * Enqueues a message. When the in-flight budget is full AND this message
   * outranks the lowest-priority lease, that lease is preempted — the
   * preempted message returns to the ready heap to be re-dispatched, and
   * this message joins the ready heap at the front of its priority class.
   *
   * Returns the preempted message when preemption happened, else null.
   */
  enqueue(payload: T, priority = 0): { message: EngineMessage<T>; preempted: EngineMessage<T> | null } {
    const msg: EngineMessage<T> = {
      id: `pm-${this.seq}`,
      payload,
      priority,
      seq: this.seq++,
      deliverAt: this.clock(),
      deliveryCount: 0,
      enqueuedAt: this.clock(),
      visibleAt: 0,
      headers: {},
    };

    let preempted: EngineMessage<T> | null = null;
    if (this.inFlight.size >= this.budget) {
      const victim = this.lowestLease();
      if (victim && msg.priority > victim.message.priority && this.canPreempt(victim)) {
        // Preempt: pull victim back to ready, give the slot to the new msg.
        this.inFlight.delete(victim.message.id);
        victim.preemptedCount++;
        this.totalPreemptions++;
        preempted = victim.message;
        // Victim requeues at the FRONT of its priority class (negative seq
        // so it beats anything already queued at its level) — the fairness
        // part of preemption, not just capacity reclamation.
        this.ready.push(victim.message, victim.message.priority, -1 - victim.preemptedCount);
        // The preemptor goes straight to a fresh lease — that IS the
        // preemption: the victim's slot is immediately reused.
        this.inFlight.set(msg.id, {
          message: msg,
          preemptedCount: 0,
          leasedAt: this.clock(),
        });
        return { message: msg, preempted };
      }
    }
    this.ready.push(msg, msg.priority, msg.seq);
    return { message: msg, preempted };
  }

  /**
   * Dequeues the next ready message into an in-flight lease, honoring the
   * budget. Returns null when empty or the budget is exhausted.
   */
  dequeue(): EngineMessage<T> | null {
    if (this.inFlight.size >= this.budget) return null;
    const msg = this.ready.pop();
    if (!msg) return null;
    msg.deliveryCount++;
    this.inFlight.set(msg.id, { message: msg, preemptedCount: 0, leasedAt: this.clock() });
    return msg;
  }

  /** Ack: release the lease slot. */
  ack(id: string): boolean {
    return this.inFlight.delete(id);
  }

  /** Is this lease preemptible? A message that's been bounced too often is immune. */
  private canPreempt(lease: Lease<T>): boolean {
    return lease.preemptedCount < this.maxPreemptions;
  }

  /** Lowest-priority in-flight lease (the cheapest victim to reclaim). */
  private lowestLease(): Lease<T> | null {
    let worst: Lease<T> | null = null;
    for (const l of this.inFlight.values()) {
      if (worst === null || l.message.priority < worst.message.priority) worst = l;
    }
    return worst;
  }

  get depth(): { ready: number; inFlight: number; preemptions: number } {
    return {
      ready: this.ready.size,
      inFlight: this.inFlight.size,
      preemptions: this.totalPreemptions,
    };
  }
}
