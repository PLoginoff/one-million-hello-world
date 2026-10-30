/**
 * SessionStitcher — anonymous → identified identity resolution.
 *
 * Trackers emit events under an anonymous device id (cookie /
 * install id) until a login or signup produces a real `userId`.
 * Stitching is the retroactive merge: when `identify(anonymousId,
 * userId)` fires, every event previously attributed to the anonymous
 * id is re-attributed to the user, sessions are merged, and future
 * anonymous events continue routing to the user until the anonymous
 * id is "reset" (logout → new anonymous id).
 *
 * Data model:
 * - `anonymous → userId` map  (many anonymous ids may feed one user)
 * - `subject → event log`     keyed by *subject* = userId or anonId
 * - `subject → sessions`      session records for gap-splitting
 *
 * Sessionization is part of the engine: events separated by more
 * than `sessionGapMs` start a new session, matching the standard
 * analytics definition (30 min default).
 *
 * Stitching never deletes the anonymous subject's history — it
 * re-keys the *index* so queries under the userId see the merged
 * timeline, while `lineage(userId)` still reports which anonymous
 * ids contributed.
 *
 * Complexity: O(log n) event insert (sorted), O(events of anon
 * subject) per stitch — bounded by one device's history.
 *
 * @module AnalyticsLayer/Engine
 */

import {
  AnalyticsClock,
  AnalyticsEvent,
  ManualAnalyticsClock,
  StitchReport,
  StitchedIdentity,
} from './types';

export interface Session {
  readonly sessionId: string;
  readonly subject: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly eventCount: number;
}

export interface SessionStitcherOptions {
  /** Inactivity gap that splits sessions. Default 30 min. */
  readonly sessionGapMs?: number;
  readonly clock?: AnalyticsClock;
}

export class SessionStitcher {
  private readonly _gapMs: number;
  private readonly _clock: AnalyticsClock;

  /** anonymousId → userId. */
  private readonly _aliases: Map<string, string>;
  /** subject (userId or anonId) → sorted events. */
  private readonly _events: Map<string, AnalyticsEvent[]>;
  /** subject → sessions (open sessions updated on the fly). */
  private readonly _sessions: Map<string, Session[]>;
  /** subject → last event ms (for gap detection). */
  private readonly _lastSeen: Map<string, number>;

  constructor(options: SessionStitcherOptions = {}) {
    this._gapMs = options.sessionGapMs ?? 30 * 60 * 1000;
    this._clock = options.clock ?? new ManualAnalyticsClock();
    this._aliases = new Map();
    this._events = new Map();
    this._sessions = new Map();
    this._lastSeen = new Map();
  }

  /**
   * Merge an anonymous identity into a user identity. Returns the
   * stitch report — how many events and sessions moved.
   *
   * Idempotent: stitching the same pair twice re-maps zero events the
   * second time. Chained stitching (anon→u1 then u1's anon list
   * includes other anons) flattens transitively: every alias pointing
   * at `userId` keeps working.
   */
  identify(anonymousId: string, userId: string): StitchReport {
    const prior = this._aliases.get(anonymousId);
    if (prior === userId) {
      return { userId, anonymousId, reattributedEvents: 0, mergedSessions: 0 };
    }
    this._aliases.set(anonymousId, userId);

    const anonEvents = this._events.get(anonymousId) ?? [];
    const anonSessions = this._sessions.get(anonymousId) ?? [];

    if (anonEvents.length > 0) {
      const userEvents = this._events.get(userId) ?? [];
      this._events.set(userId, this._mergeSorted(userEvents, anonEvents));
      this._events.set(anonymousId, []);
    }
    if (anonSessions.length > 0) {
      const userSessions = this._sessions.get(userId) ?? [];
      this._sessions.set(
        userId,
        this._mergeSessions(userSessions, anonSessions)
      );
      this._sessions.set(anonymousId, []);
    }
    const last = this._lastSeen.get(anonymousId);
    if (last !== undefined) {
      const u = this._lastSeen.get(userId);
      if (u === undefined || last > u) this._lastSeen.set(userId, last);
    }

    return {
      userId,
      anonymousId,
      reattributedEvents: anonEvents.length,
      mergedSessions: anonSessions.length,
    };
  }

  /**
   * End the anonymous↔user association (logout). Future events under
   * `anonymousId` route to a fresh anonymous subject; history stays
   * merged under the user.
   */
  reset(anonymousId: string): void {
    this._aliases.delete(anonymousId);
    this._lastSeen.delete(anonymousId);
  }

  /**
   * Ingest one event. If the anonymous id is aliased, the event is
   * filed under the resolved userId (the stitch is sticky). Session
   * gap-splitting uses the *resolved subject's* last-seen time so a
   * login mid-session doesn't fracture it.
   */
  track(event: AnalyticsEvent): void {
    const anon = event.anonymousId;
    const resolved =
      event.userId ?? (anon !== undefined ? this._aliases.get(anon) : undefined);
    const subject = resolved ?? anon;
    if (subject === undefined) return;

    let list = this._events.get(subject);
    if (list === undefined) {
      list = [];
      this._events.set(subject, list);
    }
    this._insertSorted(list, event);

    const last = this._lastSeen.get(subject);
    const sessionId =
      event.sessionId ??
      (last !== undefined && event.timestamp - last <= this._gapMs
        ? this._openSession(subject)!.sessionId
        : this._newSession(subject, event.timestamp).sessionId);

    const sessions = this._sessions.get(subject) ?? [];
    const open = sessions.length > 0 ? sessions[sessions.length - 1] : undefined;
    if (open !== undefined && open.sessionId === sessionId) {
      sessions[sessions.length - 1] = {
        ...open,
        endMs: event.timestamp,
        eventCount: open.eventCount + 1,
      };
      this._sessions.set(subject, sessions);
    }
    this._lastSeen.set(subject, event.timestamp);
  }

  /** All events attributed to a user — stitched history included. */
  eventsOf(userId: string): readonly AnalyticsEvent[] {
    return this._events.get(userId) ?? [];
  }

  /** Sessions attributed to a user — stitched sessions included. */
  sessionsOf(userId: string): readonly Session[] {
    return this._sessions.get(userId) ?? [];
  }

  /** Resolved identity record for a user. */
  identity(userId: string): StitchedIdentity | undefined {
    const events = this._events.get(userId);
    if (events === undefined) return undefined;
    const anonymousIds: string[] = [];
    for (const [anon, u] of this._aliases) {
      if (u === userId) anonymousIds.push(anon);
    }
    return {
      userId,
      anonymousIds,
      firstSeen: events[0].timestamp,
      lastSeen: events[events.length - 1].timestamp,
      eventCount: events.length,
    };
  }

  /** Which user an anonymous id currently resolves to, if any. */
  resolve(anonymousId: string): string | undefined {
    return this._aliases.get(anonymousId);
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                          */
  /* ---------------------------------------------------------------- */

  private _openSession(subject: string): Session | undefined {
    const sessions = this._sessions.get(subject);
    return sessions !== undefined && sessions.length > 0
      ? sessions[sessions.length - 1]
      : undefined;
  }

  private _newSession(subject: string, at: number): Session {
    const sessions = this._sessions.get(subject) ?? [];
    const session: Session = {
      sessionId: `${subject}:${sessions.length + 1}`,
      subject,
      startMs: at,
      endMs: at,
      eventCount: 0,
    };
    sessions.push(session);
    this._sessions.set(subject, sessions);
    return session;
  }

  /** Merge two timestamp-sorted arrays. O(a+b). */
  private _mergeSorted(
    a: readonly AnalyticsEvent[],
    b: readonly AnalyticsEvent[]
  ): AnalyticsEvent[] {
    const out = new Array<AnalyticsEvent>(a.length + b.length);
    let i = 0;
    let j = 0;
    let k = 0;
    while (i < a.length && j < b.length) {
      out[k++] = a[i].timestamp <= b[j].timestamp ? a[i++] : b[j++];
    }
    while (i < a.length) out[k++] = a[i++];
    while (j < b.length) out[k++] = b[j++];
    return out;
  }

  /** Merge session lists, renumbering the appended anonymous ones. */
  private _mergeSessions(
    user: readonly Session[],
    anon: readonly Session[]
  ): Session[] {
    const out = [...user];
    for (const s of anon) {
      out.push({ ...s, subject: user.length > 0 ? user[0].subject : s.subject });
    }
    out.sort((x, y) => x.startMs - y.startMs);
    return out;
  }

  private _insertSorted(list: AnalyticsEvent[], e: AnalyticsEvent): void {
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (list[mid].timestamp <= e.timestamp) lo = mid + 1;
      else hi = mid;
    }
    list.splice(lo, 0, e);
  }
}
