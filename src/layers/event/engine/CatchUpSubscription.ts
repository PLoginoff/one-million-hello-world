/**
 * Catch-up subscription — live + historical event delivery from a position.
 *
 * Two phases, matching EventStoreDB's `subscribeToAllFrom`:
 *
 *   1. CATCH-UP: `poll()` drains the log from the subscriber's saved
 *      position, delivering every event in order until the tip is reached.
 *   2. LIVE: after catch-up, `poll()` returns newly committed events —
 *      a pull-based live tail (push would need timers; pull keeps the
 *      subscription deterministic and testable without a clock).
 *
 * Position durability is the subscriber's responsibility: `position` is
 * exposed so callers can persist it next to their read model — committing
 * state+position together is what makes event processing effectively
 * exactly-once.
 *
 * @module EventLayer/Engine
 */

import { EventLog } from './EventLog';
import { StoredEngineEvent } from './types';
import { UpcasterRegistry } from './Upcasting';

export interface Subscription {
  readonly id: string;
  /** Next global position to deliver. */
  position: number;
}

export interface PollResult {
  readonly events: StoredEngineEvent[];
  /** True when the subscriber reached the live tip this poll. */
  readonly caughtUp: boolean;
}

export class CatchUpSubscription {
  private readonly subs = new Map<string, Subscription>();
  private nextId = 0;

  constructor(
    private readonly log: EventLog,
    private readonly upcasters: UpcasterRegistry
  ) {}

  /**
   * Opens a subscription starting at `fromPosition` (default 0 = genesis).
   * Events are delivered on `poll` — nothing flows until you pull.
   */
  subscribe(fromPosition = 0): Subscription {
    const sub: Subscription = { id: `sub-${this.nextId++}`, position: fromPosition };
    this.subs.set(sub.id, sub);
    return sub;
  }

  /**
   * Delivers up to `maxEvents` (default all available) from the
   * subscriber's position, advancing it. Upcasters apply transparently —
   * subscribers always see latest schema.
   */
  poll(sub: Subscription, maxEvents?: number): PollResult {
    if (!this.subs.has(sub.id)) {
      throw new Error(`Subscription "${sub.id}" is closed`);
    }
    const raw = this.log.readFrom(sub.position, maxEvents);
    const events = raw.map((e) => this.upcasters.upcastEvent(e));
    if (events.length > 0) {
      sub.position = events[events.length - 1].globalPosition + 1;
    }
    return { events, caughtUp: sub.position > this.log.tip };
  }

  /** Drains the subscription completely. */
  drain(sub: Subscription, batchSize = 500): StoredEngineEvent[] {
    const out: StoredEngineEvent[] = [];
    for (;;) {
      const r = this.poll(sub, batchSize);
      out.push(...r.events);
      if (r.caughtUp || r.events.length === 0) break;
    }
    return out;
  }

  close(sub: Subscription): boolean {
    return this.subs.delete(sub.id);
  }
}
