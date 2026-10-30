/**
 * Rolling Traffic Sampler
 *
 * The sliding-window aggregator behind `compareWindows`: collectors
 * keep per-side request/error tallies inside a retained window so the
 * comparison always reads the same recent slice on both sides —
 * otherwise a 10-minute-old blue burst pollutes the baseline against
 * green's last 30 seconds.
 *
 * Events arrive as `(at, requests, errors)` calls on the bus; windows
 * read `sample(side, now)` which evicts everything older than
 * `windowMs`. The math is O(1) per event append and O(W) per sample
 * where W = events inside the window (kept small — this is a rolling
 * counter, not a log).
 *
 * @module BlueGreenDeployLayer/Engine2
 */

import { BgClock2, SystemBgClock2, TrafficWindow } from './types';

interface Bucket {
  at: number;
  requests: number;
  errors: number;
}

export class TrafficSampler {
  private readonly _clock: BgClock2;
  private readonly _windowMs: number;
  private readonly _events = new Map<string, Bucket[]>();

  constructor(windowMs: number, clock: BgClock2 = new SystemBgClock2()) {
    if (windowMs <= 0) throw new Error('windowMs must be positive');
    this._windowMs = windowMs;
    this._clock = clock;
  }

  /** Record traffic for a side ('blue'/'green'/any label). */
  record(side: string, requests: number, errors: number, at?: number): void {
    const t = at ?? this._clock.now();
    const list = this._events.get(side) ?? [];
    list.push({ at: t, requests, errors });
    this._events.set(side, list);
  }

  /**
   * Sum the trailing `windowMs` of a side's traffic — the window both
   * sides of `compareWindows` should read to stay comparable.
   */
  sample(side: string, at?: number): TrafficWindow {
    const now = at ?? this._clock.now();
    const cutoff = now - this._windowMs;
    const list = this._events.get(side) ?? [];
    // Evict expired prefix (events appended in time order).
    let drop = 0;
    while (drop < list.length) {
      const b = list[drop];
      if (b === undefined || b.at >= cutoff) break;
      drop++;
    }
    if (drop > 0) list.splice(0, drop);
    let requests = 0;
    let errors = 0;
    for (const b of list) {
      requests += b.requests;
      errors += b.errors;
    }
    return { requests, errors };
  }

  /** Both sides' current windows in one call — the `traffic()` payload. */
  pair(at?: number): { blue: TrafficWindow; green: TrafficWindow } {
    return { blue: this.sample('blue', at), green: this.sample('green', at) };
  }
}
