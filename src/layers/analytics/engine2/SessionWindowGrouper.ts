/**
 * Session Window Grouper — Gap-Timeout Sessionization
 *
 * Complements engine1's `SessionStitcher` (identity merge on
 * `identify()`) with the *other* half of sessionization: grouping a
 * single subject's event stream into sessions by inactivity gap,
 * the way GA/session-analytics define a session.
 *
 *  - Events within `gapMs` of the previous event extend the current
 *    session; a longer silence closes it and opens a new one.
 *  - Sessions track first/last event time, event count, per-name
 *    histograms, and engagement stats (events/minute, bounce =
 *    single-event session).
 *  - Out-of-order events are handled by keeping an event buffer per
 *    subject and re-segmenting lazily — necessary because mobile
 *    trackers batch-upload.
 *
 * Segmentation algorithm: sort the subject's events by timestamp
 * (amortized — new events append, only re-sorts when an out-of-order
 * event lands), then a single forward pass splits wherever
 * `ts_i - ts_{i-1} > gapMs`. O(E) per rebuild, amortized O(1) for
 * in-order streams.
 *
 * Aggregate stats give the dashboard "sessions per user", "median
 * session length", "bounce rate" without storing session ids —
 * they're derived, never assigned.
 *
 * @module AnalyticsLayer/Engine2
 */

import { AnalyticsClock2, SystemAnalyticsClock2 } from './types';

export interface SessionWindowOptions {
  /** Inactivity gap that ends a session (default 30 min — GA convention). */
  readonly gapMs?: number;
  readonly clock?: AnalyticsClock2;
}

interface SubjectEvents {
  /** Buffered events (timestamp, name); kept sorted by ts. */
  events: { ts: number; name: string }[];
  /** True when `events` may have an out-of-order tail. */
  dirty: boolean;
}

export interface SessionWindow {
  /** First event timestamp. */
  readonly startedAt: number;
  /** Last event timestamp. */
  readonly endedAt: number;
  /** Duration endedAt - startedAt (0 for a single event). */
  readonly durationMs: number;
  readonly eventCount: number;
  /** Event name → count histogram. */
  readonly eventNames: Readonly<Record<string, number>>;
  /** events / minute over the session (single event = count itself). */
  readonly eventsPerMinute: number;
  /** Single-event session. */
  readonly bounce: boolean;
}

export interface SessionStats {
  readonly subjectId: string;
  readonly sessions: number;
  readonly totalEvents: number;
  readonly meanDurationMs: number;
  readonly medianDurationMs: number;
  readonly meanEventsPerSession: number;
  /** Share of sessions with exactly one event. */
  readonly bounceRate: number;
}

export class SessionWindowGrouper {
  private readonly gapMs: number;
  private readonly clock: AnalyticsClock2;
  private readonly subjects = new Map<string, SubjectEvents>();

  constructor(options: SessionWindowOptions = {}) {
    this.gapMs = options.gapMs ?? 30 * 60_000;
    if (this.gapMs <= 0) throw new Error('gapMs must be positive');
    this.clock = options.clock ?? new SystemAnalyticsClock2();
  }

  /**
   * Record one event for a subject. In-order arrivals append in
   * O(1); out-of-order arrivals flag the buffer for lazy re-sort.
   */
  track(subjectId: string, eventName: string, timestamp?: number): void {
    const ts = timestamp ?? this.clock.now();
    let s = this.subjects.get(subjectId);
    if (!s) {
      s = { events: [], dirty: false };
      this.subjects.set(subjectId, s);
    }
    const last = s.events[s.events.length - 1];
    if (last !== undefined && ts < last.ts) s.dirty = true;
    s.events.push({ ts, name: eventName });
  }

  /**
   * Segment a subject's event stream into sessions.
   * Sorts when dirty, then splits on inactivity gaps.
   */
  sessions(subjectId: string): readonly SessionWindow[] {
    const s = this.subjects.get(subjectId);
    if (!s || s.events.length === 0) return [];
    if (s.dirty) {
      s.events.sort((a, b) => a.ts - b.ts);
      s.dirty = false;
    }

    const out: SessionWindow[] = [];
    let start = 0;
    const evts = s.events;
    for (let i = 1; i <= evts.length; i++) {
      const gap = i < evts.length ? evts[i]!.ts - evts[i - 1]!.ts : Number.POSITIVE_INFINITY;
      if (i === evts.length || gap > this.gapMs) {
        out.push(this.buildWindow(evts.slice(start, i)));
        start = i;
      }
    }
    return out;
  }

  /**
   * Live session check: is the subject currently inside an open
   * session (last event within gapMs of `now`)?
   */
  isActive(subjectId: string, now?: number): boolean {
    const s = this.subjects.get(subjectId);
    if (!s || s.events.length === 0) return false;
    const t = now ?? this.clock.now();
    const lastTs = Math.max(...s.events.map((e) => e.ts));
    return t - lastTs <= this.gapMs;
  }

  /** Aggregate stats for one subject. */
  stats(subjectId: string): SessionStats | undefined {
    const sessions = this.sessions(subjectId);
    if (sessions.length === 0) return undefined;
    const durations = sessions.map((w) => w.durationMs).sort((a, b) => a - b);
    const totalEvents = sessions.reduce((n, w) => n + w.eventCount, 0);
    const bounces = sessions.filter((w) => w.bounce).length;
    const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
    const mid = Math.floor(durations.length / 2);
    const median =
      durations.length % 2 === 1
        ? durations[mid]!
        : (durations[mid - 1]! + durations[mid]!) / 2;
    return {
      subjectId,
      sessions: sessions.length,
      totalEvents,
      meanDurationMs: mean,
      medianDurationMs: median,
      meanEventsPerSession: totalEvents / sessions.length,
      bounceRate: bounces / sessions.length,
    };
  }

  /**
   * Cross-subject aggregates — the dashboard tile "avg session
   * length", "bounce rate" over all tracked subjects.
   */
  globalStats(): Omit<SessionStats, 'subjectId'> | undefined {
    const all: SessionWindow[] = [];
    for (const id of this.subjects.keys()) all.push(...this.sessions(id));
    if (all.length === 0) return undefined;
    const durations = all.map((w) => w.durationMs).sort((a, b) => a - b);
    const totalEvents = all.reduce((n, w) => n + w.eventCount, 0);
    const mid = Math.floor(durations.length / 2);
    const median =
      durations.length % 2 === 1
        ? durations[mid]!
        : (durations[mid - 1]! + durations[mid]!) / 2;
    return {
      sessions: all.length,
      totalEvents,
      meanDurationMs: durations.reduce((a, b) => a + b, 0) / durations.length,
      medianDurationMs: median,
      meanEventsPerSession: totalEvents / all.length,
      bounceRate: all.filter((w) => w.bounce).length / all.length,
    };
  }

  /** Forget a subject's buffered events. */
  forget(subjectId: string): boolean {
    return this.subjects.delete(subjectId);
  }

  /** Subjects with any buffered events. */
  subjectIds(): string[] {
    return [...this.subjects.keys()];
  }

  private buildWindow(evts: readonly { ts: number; name: string }[]): SessionWindow {
    const names: Record<string, number> = {};
    for (const e of evts) names[e.name] = (names[e.name] ?? 0) + 1;
    const startedAt = evts[0]!.ts;
    const endedAt = evts[evts.length - 1]!.ts;
    const durationMs = endedAt - startedAt;
    const minutes = durationMs / 60_000;
    return {
      startedAt,
      endedAt,
      durationMs,
      eventCount: evts.length,
      eventNames: names,
      eventsPerMinute: minutes > 0 ? evts.length / minutes : evts.length,
      bounce: evts.length === 1,
    };
  }
}
