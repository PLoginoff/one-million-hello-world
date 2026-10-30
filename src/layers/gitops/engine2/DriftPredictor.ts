/**
 * Drift Predictor — which resources will drift next?
 *
 * Records drift incidents per resource and learns proneness:
 *
 *   probability = driftCount / windowCount   (Beta-smoothed)
 *
 *   with Laplace-style smoothing (add-one) so a resource with zero
 *   history reports a small prior rather than a false-confident 0.
 *
 * Also tracks *where* drift lands: a per-field frequency table surfaces
 * "spec.replicas drifts every sync, spec.image never does" — actionable
 * for setting drift-ignore rules or accepting controller-managed fields.
 *
 * Mean inter-drift interval supports "drift overdue" detection: if a
 * resource historically drifts every ~20min and hasn't in 45min,
 * something else is masking it (or it healed).
 *
 * Complexity: O(1) per observation; O(resources) per report.
 *
 * @module GitopsLayer/Engine2
 */

import { IClock, SystemClock } from '../engines/types';
import { DriftObservation, DriftProneness } from './types';

interface ResourceHistory {
  driftCount: number;
  windowCount: number;
  /** field → drift count. */
  fieldFreq: Map<string, number>;
  /** Timestamps of recent drifts (for mean interval). */
  driftTimes: number[];
}

export interface DriftPredictorConfig {
  /** Prior weight for smoothing (pseudo-observations). Default 2. */
  readonly smoothing?: number;
  /** Max drift timestamps retained per resource for interval stats. */
  readonly intervalWindow?: number;
}

export class DriftPredictor {
  private readonly _clock: IClock;
  private readonly _smoothing: number;
  private readonly _intervalWindow: number;
  private readonly _history = new Map<string, ResourceHistory>();

  constructor(config: DriftPredictorConfig = {}, clock: IClock = new SystemClock()) {
    this._clock = clock;
    this._smoothing = config.smoothing ?? 2;
    this._intervalWindow = config.intervalWindow ?? 50;
  }

  /**
   * One observation window: which resources drifted (empty set = all
   * quiet — still counts as a window for the base rate).
   */
  observeWindow(resourceKeys: readonly string[], drifts: readonly DriftObservation[]): void {
    const drifted = new Set(drifts.map((d) => d.resourceKey));
    const now = this._clock.now();
    for (const key of resourceKeys) {
      const h = this._hist(key);
      h.windowCount++;
      if (drifted.has(key)) {
        h.driftCount++;
        h.driftTimes.push(now);
        if (h.driftTimes.length > this._intervalWindow) h.driftTimes.shift();
      }
    }
    for (const d of drifts) {
      const h = this._hist(d.resourceKey);
      for (const f of d.fields) {
        h.fieldFreq.set(f, (h.fieldFreq.get(f) ?? 0) + 1);
      }
    }
  }

  /** Proneness for one resource — smoothed drift frequency. */
  proneness(resourceKey: string): DriftProneness {
    const h = this._history.get(resourceKey);
    if (!h) {
      return {
        resourceKey,
        probability: 0,
        driftCount: 0,
        windowCount: 0,
        hotFields: [],
        meanIntervalMs: null,
      };
    }
    const hotFields = [...h.fieldFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([f]) => f);
    return {
      resourceKey,
      probability: (h.driftCount + 1) / (h.windowCount + this._smoothing),
      driftCount: h.driftCount,
      windowCount: h.windowCount,
      hotFields,
      meanIntervalMs: this._meanInterval(h),
    };
  }

  /**
   * Every tracked resource, sorted by proneness desc — the "most likely
   * to drift next" list a dashboard shows.
   */
  ranked(): DriftProneness[] {
    return [...this._history.keys()]
      .map((k) => this.proneness(k))
      .sort((a, b) => b.probability - a.probability);
  }

  /**
   * Resources whose drift cadence is overdue: drifts regularly but the
   * last drift is > 1.5× mean interval ago — the "suspiciously quiet"
   * signal.
   */
  overdue(now?: number): DriftProneness[] {
    const t = now ?? this._clock.now();
    return this.ranked().filter((p) => {
      const h = this._history.get(p.resourceKey)!;
      const mean = p.meanIntervalMs;
      if (mean === null) return false;
      const last = h.driftTimes[h.driftTimes.length - 1];
      return t - last > mean * 1.5;
    });
  }

  /* ---------------------------------------------------------------- */

  private _hist(key: string): ResourceHistory {
    let h = this._history.get(key);
    if (!h) {
      h = { driftCount: 0, windowCount: 0, fieldFreq: new Map(), driftTimes: [] };
      this._history.set(key, h);
    }
    return h;
  }

  private _meanInterval(h: ResourceHistory): number | null {
    if (h.driftTimes.length < 2) return null;
    let sum = 0;
    for (let i = 1; i < h.driftTimes.length; i++) {
      sum += h.driftTimes[i] - h.driftTimes[i - 1];
    }
    return sum / (h.driftTimes.length - 1);
  }
}
