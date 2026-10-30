/**
 * Audit Anomaly Detector
 *
 * Streaming detector fed each sealed record. Tracks per-actor event
 * volume in fixed tumbling windows and flags:
 *
 *  - `volume-spike`   current-window count exceeds multiplier x EWMA baseline
 *  - `failure-spike`  same test on failure/denied outcomes
 *  - `new-actor`      first event ever seen for an actor (optional)
 *  - `off-hours`      events outside configured business hours (optional)
 *
 * Baseline: exponentially weighted moving average of per-window counts,
 *   baseline = alpha * current + (1 - alpha) * baseline
 * updated once per closed window per actor. Requires `minWindows`
 * completed windows before flagging (warm-up period).
 *
 * Memory: O(#actors). Update: O(1) per event amortized.
 *
 * @module AuditLayer/Engine
 */

import {
  AuditRecord,
  AuditAnomaly,
  AnomalyListener,
  AuditClock,
  SystemAuditClock,
} from './types';

export interface AnomalyDetectorConfig {
  /** Tumbling window length in ms. */
  readonly windowMs: number;
  /** Spike threshold: count > multiplier * baseline. */
  readonly spikeMultiplier: number;
  /** EWMA smoothing factor (0 < alpha <= 1). */
  readonly alpha: number;
  /** Windows to observe before flagging spikes. */
  readonly minWindows: number;
  /** Raise new-actor anomalies. */
  readonly detectNewActors?: boolean;
  /** Business hours [startHour, endHour) UTC for off-hours checks. */
  readonly businessHoursUtc?: { start: number; end: number };
}

const DEFAULT_CONFIG: AnomalyDetectorConfig = {
  windowMs: 60_000,
  spikeMultiplier: 5,
  alpha: 0.3,
  minWindows: 3,
  detectNewActors: false,
};

interface ActorState {
  /** Window index (floor(timestamp / windowMs)) currently open. */
  windowIndex: number;
  /** Events counted in the open window. */
  count: number;
  /** Failures counted in the open window. */
  failCount: number;
  /** Completed windows observed (for warm-up). */
  windowsSeen: number;
  /** EWMA baseline of per-window counts. */
  baseline: number;
  /** EWMA baseline of per-window failure counts. */
  failBaseline: number;
}

export class AnomalyDetector {
  private _config: AnomalyDetectorConfig;
  private _clock: AuditClock;
  private _actors: Map<string, ActorState>;
  private _listeners: AnomalyListener[];

  constructor(config?: Partial<AnomalyDetectorConfig>, clock?: AuditClock) {
    this._config = { ...DEFAULT_CONFIG, ...config };
    this._clock = clock ?? new SystemAuditClock();
    this._actors = new Map();
    this._listeners = [];
  }

  onAnomaly(listener: AnomalyListener): void {
    this._listeners.push(listener);
  }

  /** Feed one sealed record. Returns anomalies raised (usually 0-1). */
  observe(record: AuditRecord): AuditAnomaly[] {
    const raised: AuditAnomaly[] = [];
    const actor = record.actor;
    const windowIndex = Math.floor(record.timestamp / this._config.windowMs);

    let state = this._actors.get(actor);
    if (!state) {
      state = {
        windowIndex,
        count: 0,
        failCount: 0,
        windowsSeen: 0,
        baseline: 0,
        failBaseline: 0,
      };
      this._actors.set(actor, state);
      if (this._config.detectNewActors) {
        raised.push({
          kind: 'new-actor',
          actor,
          detail: `first audit event observed for actor ${actor}`,
          detectedAt: this._clock.now(),
          observedValue: 1,
          baselineValue: 0,
        });
      }
    }

    // Close any windows that elapsed since the last event.
    while (state.windowIndex < windowIndex) {
      this._closeWindow(state, actor, raised);
      state.windowIndex++;
      state.count = 0;
      state.failCount = 0;
    }

    state.count++;
    if (record.outcome !== 'success') state.failCount++;

    if (this._config.businessHoursUtc) {
      const hour = new Date(record.timestamp).getUTCHours();
      const { start, end } = this._config.businessHoursUtc;
      const inside = start <= end ? hour >= start && hour < end : hour >= start || hour < end;
      if (!inside) {
        raised.push({
          kind: 'off-hours',
          actor,
          detail: `event at ${hour}:00 UTC outside business hours ${start}-${end}`,
          detectedAt: this._clock.now(),
          observedValue: hour,
          baselineValue: start,
        });
      }
    }

    for (const a of raised) this._emit(a);
    return raised;
  }

  /**
   * Force-close all open windows (e.g. at flush time) and emit any
   * pending spike signals. Call periodically in production.
   */
  flush(): AuditAnomaly[] {
    const raised: AuditAnomaly[] = [];
    const now = this._clock.now();
    const nowIndex = Math.floor(now / this._config.windowMs);
    for (const [actor, state] of this._actors) {
      while (state.windowIndex < nowIndex) {
        this._closeWindow(state, actor, raised);
        state.windowIndex++;
        state.count = 0;
        state.failCount = 0;
      }
    }
    for (const a of raised) this._emit(a);
    return raised;
  }

  /** Current tracked actors. */
  trackedActors(): number {
    return this._actors.size;
  }

  /** Per-actor baseline snapshot for inspection/testing. */
  baseline(actor: string): { count: number; failures: number } | undefined {
    const s = this._actors.get(actor);
    return s ? { count: s.baseline, failures: s.failBaseline } : undefined;
  }

  /**
   * Close the actor's current window: evaluate spike conditions,
   * then fold the count into the EWMA baseline.
   */
  private _closeWindow(state: ActorState, actor: string, raised: AuditAnomaly[]): void {
    if (state.windowsSeen >= this._config.minWindows && state.baseline > 0) {
      if (state.count > this._config.spikeMultiplier * state.baseline) {
        raised.push({
          kind: 'volume-spike',
          actor,
          detail: `actor ${actor} produced ${state.count} events vs baseline ${state.baseline.toFixed(1)}/window`,
          detectedAt: this._clock.now(),
          observedValue: state.count,
          baselineValue: state.baseline,
        });
      }
      if (state.failCount > this._config.spikeMultiplier * state.failBaseline &&
          state.failBaseline > 0) {
        raised.push({
          kind: 'failure-spike',
          actor,
          detail: `actor ${actor} produced ${state.failCount} failures vs baseline ${state.failBaseline.toFixed(1)}/window`,
          detectedAt: this._clock.now(),
          observedValue: state.failCount,
          baselineValue: state.failBaseline,
        });
      }
    }
    const a = this._config.alpha;
    state.baseline = state.windowsSeen === 0
      ? state.count
      : a * state.count + (1 - a) * state.baseline;
    state.failBaseline = state.windowsSeen === 0
      ? state.failCount
      : a * state.failCount + (1 - a) * state.failBaseline;
    state.windowsSeen++;
  }

  private _emit(anomaly: AuditAnomaly): void {
    for (const fn of this._listeners) {
      try {
        fn(anomaly);
      } catch {
        // listener errors must not corrupt the pipeline
      }
    }
  }
}
