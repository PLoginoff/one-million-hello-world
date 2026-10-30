/**
 * IpReputation — sliding-window scoring per client IP.
 *
 * Model: each IP has a ring of `{t, weight}` events. `record` appends;
 * `score` sums the weights of events still inside `windowMs`. A pure
 * event-log approach (rather than a decayed scalar) is chosen because
 * the score must be explainable — "score 85 = 2 threat-matches + 5
 * failed-auths" is actionable; an opaque decayed float isn't.
 *
 * Events have signed weights: negative events add to the score,
 * `GOOD_REQUEST` subtracts — a client that behaves well *recovers*
 * inside the window rather than being permanently tainted by one bad
 * request. That's the key difference from a counter: reputation is
 * a rate, not a tally.
 *
 * Verdicts: `block` at `blockThreshold`, `suspect` at
 * `suspectThreshold`, else `allow`. The middle verdict exists so the
 * pipeline can challenge (CAPTCHA, extra logging) without blocking.
 *
 * Memory: each IP's event list is trimmed on every write/read, so
 * a silent IP's history naturally shrinks — `sweep` drops empty IPs.
 * Bounded by window × max-event-rate; no unbounded growth.
 *
 * Complexity: `record`/`score` are O(events-in-window); typical
 * windows hold tens of events, not thousands.
 *
 * @module SecurityLayer/Engine
 */

import {
  ReputationEvent,
  ReputationOptions,
  ReputationScore,
  ReputationVerdict,
  SecurityClock,
  SystemSecurityClock,
} from './types';

interface TimedEvent {
  readonly t: number;
  readonly weight: number;
}

const DEFAULT_WEIGHTS: Readonly<Record<ReputationEvent, number>> = {
  [ReputationEvent.REQUEST]: 0,
  [ReputationEvent.GOOD_REQUEST]: -2,
  [ReputationEvent.MALFORMED]: 5,
  [ReputationEvent.RATE_LIMITED]: 10,
  [ReputationEvent.FAILED_AUTH]: 15,
  [ReputationEvent.THREAT_MATCH]: 40,
};

export class IpReputation {
  private readonly _windowMs: number;
  private readonly _blockAt: number;
  private readonly _suspectAt: number;
  private readonly _weights: Readonly<Record<ReputationEvent, number>>;
  private readonly _clock: SecurityClock;

  private _events: Map<string, TimedEvent[]>;
  private _totalRecords: number;

  constructor(options: ReputationOptions = {}) {
    this._windowMs = options.windowMs ?? 5 * 60_000;
    this._blockAt = options.blockThreshold ?? 100;
    this._suspectAt = options.suspectThreshold ?? 50;
    this._weights = { ...DEFAULT_WEIGHTS, ...options.weights };
    this._clock = options.clock ?? new SystemSecurityClock();
    this._events = new Map();
    this._totalRecords = 0;
  }

  /* ---------------------------------------------------------------- */
  /* Recording                                                         */
  /* ---------------------------------------------------------------- */

  /** Record an event for `ip`. Returns the resulting score. */
  record(ip: string, event: ReputationEvent, weightOverride?: number): ReputationScore {
    const w = weightOverride ?? this._weights[event] ?? 0;
    const now = this._clock.now();
    const list = this._getOrCreate(ip);
    list.push({ t: now, weight: w });
    this._trim(list, now);
    this._totalRecords++;
    return this._scoreOf(ip, list, now);
  }

  /* ---------------------------------------------------------------- */
  /* Scoring                                                           */
  /* ---------------------------------------------------------------- */

  /** Current score + verdict for `ip` (0 for unknown IPs). */
  score(ip: string): ReputationScore {
    const now = this._clock.now();
    const list = this._events.get(ip);
    if (!list) {
      return { ip, score: 0, verdict: 'allow', eventsInWindow: 0, windowExpiresInMs: 0 };
    }
    this._trim(list, now);
    return this._scoreOf(ip, list, now);
  }

  /** Verdict shorthand. */
  verdict(ip: string): ReputationVerdict {
    return this.score(ip).verdict;
  }

  /** Forget an IP (e.g. explicit allowlist reset). */
  reset(ip: string): void {
    this._events.delete(ip);
  }

  /**
   * Drop IPs whose event list is empty after trimming. Returns count.
   * Drive on a timer; a full-table O(n) pass is fine for the modest
   * cardinalities reputation tracking sees.
   */
  sweep(): number {
    const now = this._clock.now();
    let removed = 0;
    for (const [ip, list] of this._events) {
      this._trim(list, now);
      if (list.length === 0) {
        this._events.delete(ip);
        removed++;
      }
    }
    return removed;
  }

  get trackedIps(): number {
    return this._events.size;
  }

  get totalRecorded(): number {
    return this._totalRecords;
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                         */
  /* ---------------------------------------------------------------- */

  private _getOrCreate(ip: string): TimedEvent[] {
    let list = this._events.get(ip);
    if (!list) {
      list = [];
      this._events.set(ip, list);
    }
    return list;
  }

  /** Drop events older than the window (list is time-ordered). */
  private _trim(list: TimedEvent[], now: number): void {
    const cutoff = now - this._windowMs;
    let first = 0;
    while (first < list.length && list[first].t <= cutoff) {
      first++;
    }
    if (first > 0) {
      list.splice(0, first);
    }
  }

  private _scoreOf(ip: string, list: TimedEvent[], now: number): ReputationScore {
    let score = 0;
    for (const e of list) {
      score += e.weight;
    }
    // Score never goes below 0 — negative history doesn't grant
    // "credit"; reputation is a liability measure, not a balance.
    score = Math.max(0, score);

    const verdict: ReputationVerdict =
      score >= this._blockAt
        ? 'block'
        : score >= this._suspectAt
          ? 'suspect'
          : 'allow';

    const windowExpiresInMs =
      list.length === 0 ? 0 : Math.max(0, list[0].t + this._windowMs - now);

    return { ip, score, verdict, eventsInWindow: list.length, windowExpiresInMs };
  }
}
