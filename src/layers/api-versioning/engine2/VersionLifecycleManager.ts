/**
 * Version Lifecycle Manager
 *
 * Drives API versions through the lifecycle
 * `draft -> active -> deprecated -> sunset -> retired` on a schedule,
 * and emits notifications to registered listeners at each transition
 * plus configurable "sunset approaching" reminders.
 *
 * Semantics:
 * - Phase transitions are monotonic — {@link PHASE_RANK} never decreases.
 *   Attempting to schedule a regression throws.
 * - {@link tick} applies every transition whose deadline has passed,
 *   so a long-idle clock catches up in one call (e.g. deprecated ->
 *   sunset -> retired in a single tick when the schedule has fully
 *   elapsed).
 * - Deprecation and sunset each emit a notice immediately on entry;
 *   sunset additionally emits a `sunset-approaching` notice each time
 *   `tick` is called while the remaining time is within the reminder
 *   window (at most once per configured reminder slot to avoid spam).
 * - Scheduling is a per-version priority queue: each version carries a
 *   sorted list of pending transitions and `tick` drains every entry
 *   whose deadline has passed, so a full deprecation schedule
 *   (deprecated at T+30, sunset at T+60, retired at T+90) can be
 *   registered up front.
 *
 * Storage is a `Map` keyed by version; all lookups are O(1) and `tick`
 * is O(V + D) where V = versions and D = due transitions.
 *
 * @module ApiVersioningLayer/Engine2
 */

import {
  IClock,
  LifecycleNotice,
  PHASE_RANK,
  SystemClock,
  VersionLifecycle,
  VersionPhase,
} from './types';
import { VersionUsageTracker } from './VersionUsageTracker';

let noticeSeq = 0;
function nextNoticeId(): string {
  noticeSeq += 1;
  return `notice-${noticeSeq.toString(36)}`;
}

export interface LifecycleManagerOptions {
  clock?: IClock;
  /**
   * When the remaining time to a scheduled sunset drops below this
   * value (ms), a `sunset-approaching` notice is emitted. Default 7 days.
   */
  sunsetReminderMs?: number;
  /**
   * Optional usage tracker — when provided, deprecation/sunset notices
   * name the clients still calling the version, which is what makes the
   * notifications actionable.
   */
  usage?: VersionUsageTracker;
}

export class VersionLifecycleManager {
  private readonly _lifecycles: Map<string, VersionLifecycle>;
  private readonly _notices: LifecycleNotice[];
  private readonly _listeners: Array<(n: LifecycleNotice) => void>;
  private readonly _clock: IClock;
  private readonly _sunsetReminderMs: number;
  private readonly _usage: VersionUsageTracker | null;
  /** version -> last "sunset-approaching" notice epoch ms (rate-limit). */
  private readonly _lastReminder: Map<string, number>;

  constructor(options: LifecycleManagerOptions = {}) {
    this._lifecycles = new Map();
    this._notices = [];
    this._listeners = [];
    this._clock = options.clock ?? new SystemClock();
    this._sunsetReminderMs = options.sunsetReminderMs ?? 7 * 24 * 60 * 60 * 1000;
    this._usage = options.usage ?? null;
    this._lastReminder = new Map();
  }

  /**
   * Register a version in `draft` phase. Idempotent: re-registering an
   * existing version returns its current lifecycle unchanged.
   */
  register(version: string): VersionLifecycle {
    const existing = this._lifecycles.get(version);
    if (existing) return existing;
    const now = this._clock.now();
    const lc: VersionLifecycle = {
      version,
      phase: VersionPhase.Draft,
      phaseSince: now,
      nextTransitionAt: null,
      nextPhase: null,
      pending: [],
      history: [{ phase: VersionPhase.Draft, at: now }],
    };
    this._lifecycles.set(version, lc);
    return lc;
  }

  /** Publish a draft version (draft -> active). */
  activate(version: string): VersionLifecycle {
    const lc = this._require(version);
    this._transition(lc, VersionPhase.Active, this._clock.now());
    return lc;
  }

  /**
   * Schedule a phase transition for a version. Multiple transitions may
   * be queued; they are kept sorted by deadline and must each rank
   * after the current phase AND after every already-queued transition
   * (the queue is monotonic).
   *
   * @param version      version to transition
   * @param phase        target phase — must rank strictly after current
   *                     and after the last queued phase
   * @param at           epoch ms when the transition applies
   */
  scheduleTransition(version: string, phase: VersionPhase, at: number): VersionLifecycle {
    const lc = this._require(version);
    const lastQueued = lc.pending.length > 0 ? lc.pending[lc.pending.length - 1]!.phase : null;
    const minRank = PHASE_RANK[lastQueued ?? lc.phase];
    if (PHASE_RANK[phase] <= minRank) {
      throw new Error(
        `Cannot schedule ${version} -> ${phase}: would regress from ${lastQueued ?? lc.phase}`
      );
    }
    if (lc.pending.length > 0 && at < lc.pending[lc.pending.length - 1]!.at) {
      throw new Error(`Cannot schedule ${version} -> ${phase} at ${at}: before last queued transition`);
    }
    lc.pending.push({ phase, at });
    this._syncHead(lc);
    return lc;
  }

  /**
   * Apply every scheduled transition whose deadline has passed, emit
   * due notices, and fire `sunset-approaching` reminders inside the
   * reminder window. Call this periodically (cron, request middleware,
   * or explicitly in tests after advancing the clock).
   */
  tick(): LifecycleNotice[] {
    const now = this._clock.now();
    const emitted: LifecycleNotice[] = [];

    for (const lc of this._lifecycles.values()) {
      // Apply due transitions — drain the queue so long idle gaps catch up.
      while (lc.pending.length > 0 && lc.pending[0]!.at <= now) {
        const target = lc.pending.shift()!.phase;
        this._syncHead(lc);
        const notice = this._transition(lc, target, now);
        if (notice) emitted.push(notice);
      }

      // Sunset-approaching reminder inside the window, rate-limited to
      // one per window-length to keep ticks idempotent-ish.
      if (
        lc.nextPhase === VersionPhase.Sunset &&
        lc.nextTransitionAt !== null
      ) {
        const remaining = lc.nextTransitionAt - now;
        if (remaining > 0 && remaining <= this._sunsetReminderMs) {
          const last = this._lastReminder.get(lc.version) ?? -Infinity;
          if (now - last >= this._sunsetReminderMs) {
            this._lastReminder.set(lc.version, now);
            const notice = this._emit(
              lc.version,
              'sunset-approaching',
              `Version ${lc.version} sunsets in ${Math.ceil(remaining / 86400000)}d`
            );
            emitted.push(notice);
          }
        }
      }
    }
    return emitted;
  }

  /** All notices ever emitted, oldest first. */
  notices(): readonly LifecycleNotice[] {
    return this._notices;
  }

  /** Register a listener called synchronously for each new notice. */
  onNotice(listener: (n: LifecycleNotice) => void): void {
    this._listeners.push(listener);
  }

  lifecycle(version: string): VersionLifecycle | null {
    return this._lifecycles.get(version) ?? null;
  }

  /** Versions currently serving traffic (active/deprecated/sunset). */
  serving(): string[] {
    const out: string[] = [];
    for (const lc of this._lifecycles.values()) {
      if (
        lc.phase === VersionPhase.Active ||
        lc.phase === VersionPhase.Deprecated ||
        lc.phase === VersionPhase.Sunset
      ) {
        out.push(lc.version);
      }
    }
    return out;
  }

  // ------------------------------------------------------------------
  // internals
  // ------------------------------------------------------------------

  private _require(version: string): VersionLifecycle {
    const lc = this._lifecycles.get(version);
    if (!lc) throw new Error(`Unknown version: ${version}`);
    return lc;
  }

  /** Mirror the head of `pending` into nextPhase/nextTransitionAt. */
  private _syncHead(lc: VersionLifecycle): void {
    const head = lc.pending[0] ?? null;
    lc.nextPhase = head ? head.phase : null;
    lc.nextTransitionAt = head ? head.at : null;
  }

  /**
   * Move `lc` into `phase` at `at`, record history, and emit the
   * appropriate notice. Returns the emitted notice (or null for
   * transitions that announce nothing — e.g. draft -> active).
   */
  private _transition(
    lc: VersionLifecycle,
    phase: VersionPhase,
    at: number
  ): LifecycleNotice | null {
    lc.phase = phase;
    lc.phaseSince = at;
    lc.history.push({ phase, at });

    if (phase === VersionPhase.Deprecated) {
      return this._emit(
        lc.version,
        'deprecation-announced',
        this._withCallers(lc.version, `Version ${lc.version} is deprecated`)
      );
    }
    if (phase === VersionPhase.Sunset) {
      return this._emit(
        lc.version,
        'sunset',
        this._withCallers(lc.version, `Version ${lc.version} is now sunset`)
      );
    }
    if (phase === VersionPhase.Retired) {
      return this._emit(lc.version, 'retired', `Version ${lc.version} retired`);
    }
    return null;
  }

  /** Append the still-calling client list to a message when known. */
  private _withCallers(version: string, base: string): string {
    if (!this._usage) return base;
    const clients = this._usage.clientsOf(version);
    return clients.length > 0 ? `${base} — still used by: ${clients.join(', ')}` : base;
  }

  private _emit(
    version: string,
    kind: LifecycleNotice['kind'],
    message: string
  ): LifecycleNotice {
    const notice: LifecycleNotice = {
      id: nextNoticeId(),
      version,
      kind,
      emittedAt: this._clock.now(),
      message,
    };
    this._notices.push(notice);
    for (const l of this._listeners) l(notice);
    return notice;
  }
}
