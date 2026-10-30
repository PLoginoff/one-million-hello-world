/**
 * ConsistencyMonitor — alerting on top of per-projection checkpoints.
 *
 * `ConsistencyTracker` (implementations/) measures lag distribution; this
 * monitor answers the ops question: "which projections are too far behind
 * RIGHT NOW?" It reads checkpoints from a ReadModelStore, compares them
 * against a write-side head supplier, and raises alerts when lag crosses
 * a threshold — with hysteresis so a flapping projection doesn't spam.
 *
 * Alerting model:
 *   - Each projection has `warnLag` / `critLag` thresholds (events).
 *   - State machine: OK → WARN → CRIT (and back). One alert per transition,
 *     not per check — no repeated alerts while a level holds.
 *   - `minDurationMs`: lag must persist this long before the first alert —
 *     smooths out rebuild bursts and bursty writes. Once alerted,
 *     escalating WARN→CRIT alerts immediately.
 *   - Alerts are delivered to registered handlers (log, webhook, metrics).
 *
 * Time is injectable (IClock) for deterministic tests.
 *
 * @module CqrsLayer/Engine
 */

import { ReadModelStore } from './ReadModelStore';
import { IClock, SystemClock } from '../../observability/engine/signals';

export type LagLevel = 'ok' | 'warn' | 'crit';

export interface ProjectionThresholds {
  /** Lag (events) at/above which the projection goes WARN. */
  readonly warnLag: number;
  /** Lag at/above which it goes CRIT. Must be >= warnLag. */
  readonly critLag: number;
}

export interface MonitorAlert {
  readonly projection: string;
  readonly from: LagLevel;
  readonly to: LagLevel;
  readonly lag: number;
  readonly head: number;
  readonly applied: number;
  readonly at: number;
}

export type AlertHandler = (alert: MonitorAlert) => void;

interface ProjectionState {
  level: LagLevel;
  /** First time the current non-ok lag was observed; 0 = not pending. */
  pendingSince: number;
}

export interface MonitorConfig {
  readonly thresholds: Record<string, ProjectionThresholds>;
  /** Default thresholds for projections not listed explicitly. */
  readonly defaultThresholds?: ProjectionThresholds;
  /** Persist duration before first alert; default 0 (immediate). */
  readonly minDurationMs?: number;
}

export class ConsistencyMonitor {
  private readonly _store: ReadModelStore;
  private readonly _head: () => number;
  private readonly _clock: IClock;
  private readonly _thresholds: Record<string, ProjectionThresholds>;
  private readonly _default: ProjectionThresholds;
  private readonly _minDuration: number;
  private readonly _handlers: AlertHandler[] = [];
  private readonly _states = new Map<string, ProjectionState>();
  private readonly _history: MonitorAlert[] = [];

  constructor(
    store: ReadModelStore,
    headSupplier: () => number,
    config: MonitorConfig,
    clock: IClock = new SystemClock()
  ) {
    this._store = store;
    this._head = headSupplier;
    this._clock = clock;
    this._thresholds = config.thresholds;
    this._default = config.defaultThresholds ?? { warnLag: 100, critLag: 1000 };
    this._minDuration = config.minDurationMs ?? 0;
  }

  onAlert(handler: AlertHandler): void {
    this._handlers.push(handler);
  }

  private _thresholdsFor(projection: string): ProjectionThresholds {
    return this._thresholds[projection] ?? this._default;
  }

  /** Level a lag value maps to under `t`. */
  static classify(lag: number, t: ProjectionThresholds): LagLevel {
    if (lag >= t.critLag) return 'crit';
    if (lag >= t.warnLag) return 'warn';
    return 'ok';
  }

  /**
   * Evaluate all tracked projections once. Call this on a timer or after
   * each batch commit. Returns the alerts raised this pass.
   */
  check(projections?: readonly string[]): MonitorAlert[] {
    const head = this._head();
    const now = this._clock.nowMs();
    const names = projections ?? this._knownProjections();
    const raised: MonitorAlert[] = [];

    for (const name of names) {
      const applied = this._store.checkpoint(name);
      const lag = Math.max(0, head - applied);
      const t = this._thresholdsFor(name);
      const target = ConsistencyMonitor.classify(lag, t);

      let st = this._states.get(name);
      if (!st) {
        st = { level: 'ok', pendingSince: 0 };
        this._states.set(name, st);
      }

      if (target === st.level) {
        // Level holds (incl. ok→ok): any pending escalation is cancelled
        // only when lag actually recovered.
        if (target === 'ok') st.pendingSince = 0;
        continue;
      }

      if (target === 'ok') {
        // Recovery: notify immediately, clear pending.
        raised.push(this._emit(name, st.level, 'ok', lag, head, applied, now));
        st.level = 'ok';
        st.pendingSince = 0;
        continue;
      }

      // target is warn/crit and differs from current level.
      if (st.level === 'ok') {
        // First excursion above warn: start (or continue) the pending timer.
        if (st.pendingSince === 0) st.pendingSince = now;
        if (now - st.pendingSince < this._minDuration) continue;
        raised.push(this._emit(name, 'ok', target, lag, head, applied, now));
        st.level = target;
        st.pendingSince = 0;
      } else {
        // Already alerting at some level: escalate/de-escalate immediately.
        raised.push(this._emit(name, st.level, target, lag, head, applied, now));
        st.level = target;
        st.pendingSince = 0;
      }
    }
    return raised;
  }

  private _emit(
    projection: string, from: LagLevel, to: LagLevel,
    lag: number, head: number, applied: number, at: number
  ): MonitorAlert {
    const alert: MonitorAlert = { projection, from, to, lag, head, applied, at };
    this._history.push(alert);
    if (this._history.length > 500) this._history.splice(0, this._history.length - 500);
    for (const h of this._handlers) h(alert);
    return alert;
  }

  private _knownProjections(): string[] {
    return [...new Set([...Object.keys(this._store.checkpoints()), ...Object.keys(this._thresholds)])];
  }

  /** Current level + lag per projection — for a dashboard. */
  status(): Record<string, { level: LagLevel; lag: number; applied: number }> {
    const head = this._head();
    const out: Record<string, { level: LagLevel; lag: number; applied: number }> = {};
    for (const name of this._knownProjections()) {
      const applied = this._store.checkpoint(name);
      const lag = Math.max(0, head - applied);
      out[name] = {
        level: this._states.get(name)?.level ?? 'ok',
        lag,
        applied,
      };
    }
    return out;
  }

  alerts(): MonitorAlert[] {
    return [...this._history];
  }
}
