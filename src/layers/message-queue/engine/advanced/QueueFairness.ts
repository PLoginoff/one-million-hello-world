/**
 * QueueFairness — weighted-fair-queueing scheduler across producer classes.
 *
 * When several tenants share a queue, a pure FIFO lets a chatty producer
 * monopolize dispatch: enqueue 10,000 messages and everyone's behind you.
 * Weighted Fair Queueing (WFQ — the network-scheduler algorithm Cisco
 * popularized, adapted to message dispatch) interleaves by CLASS weight:
 *
 *   Each class has a "virtual finish time" that advances by
 *   `cost / weight` per dispatched message — high-weight classes advance
 *   slowly, so they win more often. The scheduler always dispatches the
 *   class with the smallest virtual finish time that has a message ready.
 *
 * Result: a class with weight 2 and a class with weight 1 share dispatch
 * roughly 2:1, and a burst from one class can't starve another — the
 * deficit accrues but the weight ratio still bounds the worst case.
 *
 * Implementation: a min-heap keyed on virtual finish time per class head —
 * O(log C) per dispatch where C is class count, regardless of queued depth.
 *
 * @module MessageQueueLayer/Engine/Advanced
 */

import { EngineMessage } from '../types';

export interface FairnessClass {
  readonly name: string;
  /** Dispatch weight — higher = more share. >= 0.01. */
  readonly weight: number;
}

interface ClassState {
  readonly name: string;
  readonly weight: number;
  /** Pending messages (FIFO within the class), each with its vfinish stamp. */
  readonly queue: { msg: EngineMessage<unknown>; vfinish: number }[];
  /** Virtual finish time of the LAST dispatched message — next stamp base. */
  vft: number;
  dispatched: number;
}

export class QueueFairness<T = unknown> {
  private readonly classes = new Map<string, ClassState>();
  /** Global virtual time — advances with dispatch, prevents new-class burst. */
  private virtualTime = 0;

  /** Registers a class with a dispatch weight. */
  registerClass(name: string, weight = 1): void {
    if (this.classes.has(name)) throw new Error(`Class "${name}" exists`);
    this.classes.set(name, {
      name,
      weight: Math.max(0.01, weight),
      queue: [],
      vft: 0,
      dispatched: 0,
    });
  }

  /**
   * Enqueues into a class. New classes start at the current virtual time —
   * without that, a class registering late would have vft=0 and dispatch
   * exclusively until it caught up (the "new-flow" burst WFQ papers handle).
   */
  /**
   * Enqueues into a class. Each message gets a virtual FINISH stamp:
   * `vfinish = max(classVft, globalVirtualTime) + 1/weight`. A class that
   * idled rejoins at globalTime (can't bank credits); a class with queued
   * messages stacks finish-times so later ones dispatch later — the per-
   * packet virtual clock real WFQ uses, not a per-class accumulator.
   */
  enqueue(className: string, msg: EngineMessage<T>): void {
    const c = this.class_(className);
    const base = Math.max(c.vft, this.virtualTime);
    const vfinish = base + 1 / c.weight;
    c.queue.push({ msg, vfinish });
    c.vft = vfinish;
  }

  /**
   * Dispatches the next message: the class with the SMALLEST virtual finish
   * time among those with pending work wins. Its vft advances by
   * `1 / weight` — heavier classes advance slower, so they win again sooner.
   */
  dispatch(): { className: string; message: EngineMessage<T> } | null {
    let best: ClassState | null = null;
    let bestFinish = Number.POSITIVE_INFINITY;
    for (const c of this.classes.values()) {
      if (c.queue.length === 0) continue;
      const head = c.queue[0].vfinish;
      if (head < bestFinish) {
        bestFinish = head;
        best = c;
      }
    }
    if (!best) return null;
    const head = best.queue.shift() as { msg: EngineMessage<T>; vfinish: number };
    best.dispatched++;
    // Global time = the winning message's finish — a class that was idle
    // rejoins here, not at its stale vft (prevents catch-up bursts).
    this.virtualTime = Math.max(this.virtualTime, head.vfinish);
    return { className: best.name, message: head.msg };
  }

  /** Drains all pending messages in WFQ order. */
  drain(): { className: string; message: EngineMessage<T> }[] {
    const out: { className: string; message: EngineMessage<T> }[] = [];
    for (;;) {
      const d = this.dispatch();
      if (!d) break;
      out.push(d);
    }
    return out;
  }

  /** Observed dispatch share per class (for fairness assertions in tests). */
  shares(): Record<string, number> {
    const total = [...this.classes.values()].reduce((s, c) => s + c.dispatched, 0);
    const out: Record<string, number> = {};
    for (const c of this.classes.values()) {
      out[c.name] = total === 0 ? 0 : c.dispatched / total;
    }
    return out;
  }

  /** Pending depth per class. */
  depth(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const c of this.classes.values()) out[c.name] = c.queue.length;
    return out;
  }

  private class_(name: string): ClassState {
    const c = this.classes.get(name);
    if (!c) throw new Error(`Unknown class "${name}"`);
    return c;
  }
}
