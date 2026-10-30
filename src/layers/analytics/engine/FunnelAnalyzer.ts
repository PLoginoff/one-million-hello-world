/**
 * FunnelAnalyzer — multi-step conversion funnels with drop-off
 * attribution.
 *
 * Two semantics:
 *
 * - `ordered`   — a user converts through step *k* only if they
 *                  produced events matching steps 0..k in order
 *                  (classic funnel: subsequence matching). Implemented
 *                  as a per-user greedy scan over their timestamped
 *                  event stream: a pointer walks the step list; each
 *                  event that matches the current step advances it.
 *                  O(events per user) — no backtracking needed because
 *                  funnel conversion is monotone: taking the earliest
 *                  match never hurts.
 *
 * - `unordered` — a user converts through step *k* if they produced
 *                  every one of steps 0..k at least once inside the
 *                  conversion window (set semantics; order free).
 *
 * The optional `conversionWindowMs` requires that steps 1..n-1 all
 * land within `window` ms of the user's step-0 event (ordered mode)
 * or that all events fit in some window of that size (unordered mode
 * uses first-matching-event as the anchor).
 *
 * Drop-off attribution: for each step k>0 we compare the property
 * distribution of users who *reached* k-1 but not k ("dropped") with
 * users who reached k ("continued"), and report values with the
 * largest positive lift (over-representation among the dropped) —
 * e.g. `{step:2, property:'browser', value:'ie11', lift:0.42}`.
 *
 * Complexity: O(total events) ingest + O(users × events/user) per
 * report. Attribution is O(dropped × distinct props).
 *
 * @module AnalyticsLayer/Engine
 */

import {
  AnalyticsEvent,
  DropOffAttribution,
  FunnelMode,
  FunnelOptions,
  FunnelReport,
  FunnelStepResult,
} from './types';

/** Per-user ordered traversal outcome. */
interface JourneyResult {
  /** Deepest step index reached (0-based), or -1 if step 0 never hit. */
  readonly deepestStep: number;
}

export class FunnelAnalyzer {
  private readonly _steps: readonly string[];
  private readonly _mode: FunnelMode;
  private readonly _windowMs: number;

  /** userId → timestamp-ordered events. */
  private readonly _eventsByUser: Map<string, AnalyticsEvent[]>;

  /**
   * @param steps funnel step event names, in order.
   * @param options funnel semantics.
   */
  constructor(steps: readonly string[], options: FunnelOptions = {}) {
    if (steps.length < 2) {
      throw new RangeError('funnel needs at least 2 steps');
    }
    if (new Set(steps).size !== steps.length) {
      throw new RangeError('funnel steps must be distinct');
    }
    this._steps = steps;
    this._mode = options.mode ?? 'ordered';
    this._windowMs = options.conversionWindowMs ?? 0;
    this._eventsByUser = new Map();
  }

  get mode(): FunnelMode {
    return this._mode;
  }

  get steps(): readonly string[] {
    return this._steps;
  }

  /**
   * Ingest one event. Events for a user are kept sorted by timestamp;
   * late-arriving events are inserted at the right position via binary
   * search so out-of-order delivery doesn't corrupt journeys.
   * Amortized O(log n) insert + O(1) append in the common case.
   */
  addEvent(event: AnalyticsEvent): void {
    const userId = this._subjectId(event);
    if (userId === undefined) return; // unidentified, unstitchable
    let list = this._eventsByUser.get(userId);
    if (list === undefined) {
      list = [];
      this._eventsByUser.set(userId, list);
    }
    this._insertSorted(list, event);
  }

  addEvents(events: readonly AnalyticsEvent[]): void {
    for (const e of events) this.addEvent(e);
  }

  /** Users currently tracked. */
  get userCount(): number {
    return this._eventsByUser.size;
  }

  /**
   * Compute the funnel report.
   * @param attributionProperties event property keys to run drop-off
   *        attribution over (e.g. ['browser','plan']). Skip = [].
   */
  report(attributionProperties: readonly string[] = []): FunnelReport {
    const depths = new Map<string, number>();
    for (const [userId, events] of this._eventsByUser) {
      const journey =
        this._mode === 'ordered'
          ? this._orderedJourney(events)
          : this._unorderedJourney(events);
      depths.set(userId, journey.deepestStep);
    }

    const entrants = [...depths.values()].filter((d) => d >= 0).length;
    const steps: FunnelStepResult[] = [];
    let prevCount = 0;
    for (let k = 0; k < this._steps.length; k++) {
      const count = [...depths.values()].filter((d) => d >= k).length;
      steps.push({
        step: k,
        name: this._steps[k],
        count,
        conversionFromStart: entrants > 0 ? count / entrants : 0,
        conversionFromPrevious: k === 0 ? 1 : prevCount > 0 ? count / prevCount : 0,
        droppedFromPrevious: k === 0 ? 0 : prevCount - count,
      });
      prevCount = count;
    }

    const attributions = this._attributions(depths, attributionProperties);
    return { mode: this._mode, entrants, steps, attributions };
  }

  /**
   * Deepest step reached by one subject. Accepts either the bare
   * userId/anonymousId or an already-prefixed key (`u:`,`a:`).
   */
  depthOf(userId: string): number {
    const events =
      this._eventsByUser.get(`u:${userId}`) ??
      this._eventsByUser.get(`a:${userId}`) ??
      this._eventsByUser.get(userId);
    if (events === undefined) return -1;
    return this._mode === 'ordered'
      ? this._orderedJourney(events).deepestStep
      : this._unorderedJourney(events).deepestStep;
  }

  /* ---------------------------------------------------------------- */
  /* Ordered journeys                                                   */
  /* ---------------------------------------------------------------- */

  /**
   * Greedy subsequence scan. Pointer `step` starts at 0; each event
   * whose name equals `steps[step]` advances the pointer and — for
   * step 0 — anchors the conversion window. If an event matches
   * `steps[0]` while we're mid-journey and we're already past the
   * window, we *restart* the journey at that event: re-anchoring on
   * the latest step-0 event maximizes the chance the remaining steps
   * fall inside the window. This restart rule is what makes the
   * single pass correct under a window constraint.
   */
  private _orderedJourney(events: readonly AnalyticsEvent[]): JourneyResult {
    let step = 0;
    let anchor = -1;
    let deepest = -1;

    for (const e of events) {
      const name = e.name;
      if (step === 0) {
        if (name === this._steps[0]) {
          anchor = e.timestamp;
          deepest = 0;
          step = 1;
          if (this._steps.length === 1) break;
        }
        continue;
      }

      if (this._windowMs > 0 && e.timestamp - anchor > this._windowMs) {
        // Window blew out. If this event restarts the funnel, take it.
        if (name === this._steps[0]) {
          anchor = e.timestamp;
          deepest = Math.max(deepest, 0);
          step = 1;
          continue;
        }
        // Otherwise the journey is dead — keep scanning for a new
        // step-0 anchor (handled by the `step === 0` branch next iter).
        step = 0;
        anchor = -1;
        if (name === this._steps[0]) {
          anchor = e.timestamp;
          deepest = Math.max(deepest, 0);
          step = 1;
        }
        continue;
      }

      if (name === this._steps[step]) {
        deepest = step;
        step++;
        if (step === this._steps.length) break; // fully converted
      } else if (name === this._steps[0]) {
        // Re-anchor: a fresh attempt supersedes a stalled one only when
        // the stalled attempt hasn't gotten further (it has — we keep
        // `deepest`) but resets window pressure.
        anchor = e.timestamp;
        step = 1;
        deepest = Math.max(deepest, 0);
      }
    }
    return { deepestStep: deepest };
  }

  /* ---------------------------------------------------------------- */
  /* Unordered journeys                                                 */
  /* ---------------------------------------------------------------- */

  /**
   * Set semantics: collect the *first* timestamp each step event was
   * seen, then check all of steps 0..k exist and (with a window) span
   * ≤ windowMs from earliest to latest among the first-k+1 steps.
   */
  private _unorderedJourney(events: readonly AnalyticsEvent[]): JourneyResult {
    const firstSeen = new Map<string, number>();
    for (const e of events) {
      const existing = firstSeen.get(e.name);
      if (existing === undefined || e.timestamp < existing) {
        firstSeen.set(e.name, e.timestamp);
      }
    }
    let deepest = -1;
    for (let k = 0; k < this._steps.length; k++) {
      // All of steps 0..k must be present.
      let ok = true;
      let earliest = Number.POSITIVE_INFINITY;
      let latest = Number.NEGATIVE_INFINITY;
      for (let j = 0; j <= k; j++) {
        const t = firstSeen.get(this._steps[j]);
        if (t === undefined) {
          ok = false;
          break;
        }
        if (t < earliest) earliest = t;
        if (t > latest) latest = t;
      }
      if (!ok) break;
      if (this._windowMs > 0 && latest - earliest > this._windowMs) break;
      deepest = k;
    }
    return { deepestStep: deepest };
  }

  /* ---------------------------------------------------------------- */
  /* Drop-off attribution                                               */
  /* ---------------------------------------------------------------- */

  /**
   * For each step k>0 with drops, build the property→value
   * distributions of dropped vs. continued users (using each user's
   * events *before* the drop point — i.e. all events of users who
   * stalled at k-1, and events up to their step-k completion for
   * continuers) and report every (property, value) with positive lift,
   * sorted by lift descending, top 10 per step.
   */
  private _attributions(
    depths: ReadonlyMap<string, number>,
    properties: readonly string[]
  ): DropOffAttribution[] {
    if (properties.length === 0) return [];
    const out: DropOffAttribution[] = [];

    for (let k = 1; k < this._steps.length; k++) {
      const dropped: string[] = [];
      const continued: string[] = [];
      for (const [userId, depth] of depths) {
        if (depth === k - 1) dropped.push(userId);
        else if (depth >= k) continued.push(userId);
      }
      if (dropped.length === 0) continue;

      const droppedDist = this._distribution(dropped, properties);
      const continuedDist = this._distribution(continued, properties);

      const cell: DropOffAttribution[] = [];
      for (const [prop, values] of droppedDist) {
        for (const [value, dropCount] of values) {
          const droppedShare = dropCount / dropped.length;
          const contCount = continuedDist.get(prop)?.get(value) ?? 0;
          const continuedShare =
            continued.length > 0 ? contCount / continued.length : 0;
          const lift = droppedShare - continuedShare;
          if (lift > 0) {
            cell.push({
              step: k,
              property: prop,
              value,
              droppedShare,
              continuedShare,
              lift,
            });
          }
        }
      }
      cell.sort((a, b) => b.lift - a.lift);
      out.push(...cell.slice(0, 10));
    }
    return out;
  }

  /**
   * property → value → fraction-of-users-carrying counts. A user
   * counts once per (property, value) pair no matter how many events
   * carry it — shares are user-level, not event-level.
   */
  private _distribution(
    userIds: readonly string[],
    properties: readonly string[]
  ): Map<string, Map<string, number>> {
    const dist = new Map<string, Map<string, number>>();
    for (const userId of userIds) {
      const events = this._eventsByUser.get(userId);
      if (events === undefined) continue;
      const seen = new Set<string>();
      for (const e of events) {
        if (e.properties === undefined) continue;
        for (const prop of properties) {
          const raw = e.properties[prop];
          if (raw === undefined) continue;
          const value = String(raw);
          const key = `${prop}${value}`;
          if (seen.has(key)) continue;
          seen.add(key);
          let values = dist.get(prop);
          if (values === undefined) {
            values = new Map();
            dist.set(prop, values);
          }
          values.set(value, (values.get(value) ?? 0) + 1);
        }
      }
    }
    return dist;
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                          */
  /* ---------------------------------------------------------------- */

  /** Stitching key: prefer userId, fall back to anonymous id. */
  private _subjectId(e: AnalyticsEvent): string | undefined {
    if (e.userId !== undefined) return `u:${e.userId}`;
    if (e.anonymousId !== undefined) return `a:${e.anonymousId}`;
    return undefined;
  }

  /** Binary-search insert into a timestamp-sorted array. */
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
