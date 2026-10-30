/**
 * SLO Tracker — error budget + burn rate over a rolling window.
 *
 * Events are recorded as good/bad with timestamps. The tracker keeps
 * them in a time-ordered deque and slides a window of `windowMs` across
 * them: events that fall out the left edge are evicted (amortized O(1)
 * per record, O(evicted) per snapshot).
 *
 * Budget maths (the SRE-workbook formulation):
 *   allowedRatio   = 1 - target
 *   observedRatio  = bad / total
 *   burnRate       = observedRatio / allowedRatio
 *   budgetLeft     = 1 - burnRate * elapsedFraction_of_window-equivalent
 *
 * A burn rate of 1 means "on pace to exactly exhaust the budget at
 * window end". The classic multi-window alert is burnRate > 14.4 for a
 * 30-day 99.9% SLO (page) or > 6 (ticket); those thresholds live with
 * the caller, not here.
 *
 * @module ObservabilityLayer/Engine2
 */

import { IClock, SystemClock } from '../engine/signals';
import { SloDefinition, SloEventKind, SloSnapshot } from './types';

interface TimedEvent {
  readonly atMs: number;
  readonly kind: SloEventKind;
}

interface SloRuntime {
  readonly def: SloDefinition;
  /** Time-ordered event deque. Index-based pop-front (head pointer). */
  events: TimedEvent[];
  head: number;
  bad: number;
  total: number;
}

export class SloTracker {
  private readonly _clock: IClock;
  private readonly _slos = new Map<string, SloRuntime>();

  constructor(clock: IClock = new SystemClock()) {
    this._clock = clock;
  }

  registerSlo(def: SloDefinition): void {
    if (def.target <= 0 || def.target >= 1) {
      throw new SloError(`SLO "${def.id}": target must be in (0, 1), got ${def.target}`);
    }
    this._slos.set(def.id, { def, events: [], head: 0, bad: 0, total: 0 });
  }

  /**
   * Record `count` events (default 1) of a kind at `atMs` (default now).
   * Events must arrive in roughly time order for the deque to behave;
   * out-of-order inserts are sorted in lazily on the next snapshot.
   */
  record(sloId: string, kind: SloEventKind, count = 1, atMs?: number): void {
    const rt = this._slos.get(sloId);
    if (!rt) throw new SloError(`unknown SLO "${sloId}"`);
    const ts = atMs ?? this._clock.nowMs();
    for (let i = 0; i < count; i++) rt.events.push({ atMs: ts, kind });
    rt.total += count;
    if (kind === 'bad') rt.bad += count;
  }

  /**
   * Slide the window and produce the budget snapshot.
   * `windowStartMs` reported is `now - windowMs` (the open left edge).
   */
  snapshot(sloId: string, nowMs?: number): SloSnapshot {
    const rt = this._slos.get(sloId);
    if (!rt) throw new SloError(`unknown SLO "${sloId}"`);
    const now = nowMs ?? this._clock.nowMs();
    const edge = now - rt.def.windowMs;
    this._evict(rt, edge);

    const total = rt.total;
    const bad = rt.bad;
    const allowedRatio = 1 - rt.def.target;
    const observedRatio = total === 0 ? 0 : bad / total;
    const burnRate = allowedRatio === 0 ? 0 : observedRatio / allowedRatio;
    // Budget consumed fraction = observed bad / allowed bad.
    const allowedBad = allowedRatio * total;
    const budgetRemaining = total === 0 ? 1 : 1 - bad / allowedBad;

    // ETA: at the current *instantaneous* bad-rate (bad / elapsed window
    // time actually observed), how long until remaining budget = 0.
    let exhaustionEtaMs: number | undefined;
    if (bad > 0 && total > 0) {
      const observedSpan = Math.max(now - rt.events[rt.head].atMs, 1);
      const badRatePerMs = bad / observedSpan;
      const remainingBad = Math.max(allowedBad - bad, 0);
      exhaustionEtaMs = remainingBad / badRatePerMs;
    }

    return {
      sloId,
      windowStartMs: edge,
      nowMs: now,
      totalEvents: total,
      badEvents: bad,
      observedRatio,
      budgetRemaining,
      burnRate,
      exhaustionEtaMs,
    };
  }

  /** Evict events strictly older than `edge`, fixing counters. */
  private _evict(rt: SloRuntime, edge: number): void {
    // Late-arriving events can disorder the tail; sort lazily if needed.
    if (rt.events.length - rt.head > 1 && !isSortedByTime(rt.events, rt.head)) {
      const tail = rt.events.slice(rt.head).sort((a, b) => a.atMs - b.atMs);
      rt.events = rt.events.slice(0, rt.head).concat(tail);
    }
    while (rt.head < rt.events.length && rt.events[rt.head].atMs < edge) {
      const e = rt.events[rt.head];
      rt.total -= 1;
      if (e.kind === 'bad') rt.bad -= 1;
      rt.head += 1;
    }
    // Compact when the dead prefix dominates — keeps memory O(window).
    if (rt.head > 1024 && rt.head * 2 > rt.events.length) {
      rt.events = rt.events.slice(rt.head);
      rt.head = 0;
    }
  }
}

function isSortedByTime(events: TimedEvent[], head: number): boolean {
  for (let i = head + 1; i < events.length; i++) {
    if (events[i].atMs < events[i - 1].atMs) return false;
  }
  return true;
}

export class SloError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SloError';
  }
}
