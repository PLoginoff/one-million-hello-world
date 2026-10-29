/**
 * StreamingDetectors
 *
 * Time-series detectors that work point-by-point:
 *  - MovingAverageDetector: deviation from a trailing window mean.
 *  - EwmaDetector: exponentially weighted moving average + variance tracking.
 *  - CusumDetector: cumulative sum change detector.
 */

import {
  IBatchDetector,
  IStreamingDetector,
  DataPoint,
  Anomaly,
  mean,
  stddev,
} from './Types';

export interface MovingAverageOptions {
  /** trailing window size */
  readonly window?: number;
  /** z-threshold vs window stddev */
  readonly threshold?: number;
}

export class MovingAverageDetector implements IBatchDetector, IStreamingDetector {
  readonly name = 'moving-average';
  private readonly window: number;
  private readonly threshold: number;
  private readonly buffer: number[] = [];

  constructor(options: MovingAverageOptions = {}) {
    this.window = options.window ?? 10;
    this.threshold = options.threshold ?? 3;
  }

  detect(series: readonly DataPoint[]): Anomaly[] {
    this.reset();
    const anomalies: Anomaly[] = [];
    for (let i = 0; i < series.length; i++) {
      const a = this.update(series[i]);
      if (a !== null) {
        anomalies.push({ ...a, index: i, timestamp: series[i].timestamp });
      }
    }
    return anomalies;
  }

  update(point: DataPoint): Anomaly | null {
    if (this.buffer.length < this.window) {
      this.buffer.push(point.value);
      return null;
    }
    const m = mean(this.buffer);
    const s = stddev(this.buffer);
    this.buffer.push(point.value);
    if (this.buffer.length > this.window) this.buffer.shift();
    if (s === 0) return null;
    const z = Math.abs(point.value - m) / s;
    if (z > this.threshold) {
      return {
        index: -1,
        timestamp: point.timestamp,
        value: point.value,
        score: z,
        severity: Math.min(1, z / (this.threshold * 2)),
        detector: this.name,
        explanation: `value ${point.value.toFixed(2)} deviates ${z.toFixed(2)}σ from window mean ${m.toFixed(2)}`,
      };
    }
    return null;
  }

  reset(): void {
    this.buffer.length = 0;
  }
}

export interface EwmaOptions {
  /** smoothing factor in (0,1]; higher = more weight on recent points */
  readonly alpha?: number;
  /** z-threshold against the EWMA stddev */
  readonly threshold?: number;
  /** points to warm up before flagging */
  readonly warmup?: number;
}

/**
 * EWMA control-chart detector (Roberts 1959). Maintains running estimates
 * of mean and variance with exponential smoothing; flags points whose
 * deviation exceeds `threshold` sigmas. Equivalent to an (approximate)
 * ARIMA(0,1,1) one-step forecast residual test.
 */
export class EwmaDetector implements IStreamingDetector, IBatchDetector {
  readonly name = 'ewma';
  private readonly alpha: number;
  private readonly threshold: number;
  private readonly warmup: number;
  private meanEstimate = 0;
  private varEstimate = 0;
  private count = 0;

  constructor(options: EwmaOptions = {}) {
    this.alpha = options.alpha ?? 0.3;
    this.threshold = options.threshold ?? 3;
    this.warmup = options.warmup ?? 10;
  }

  update(point: DataPoint): Anomaly | null {
    const v = point.value;
    let anomaly: Anomaly | null = null;
    if (this.count === 0) {
      this.meanEstimate = v;
      this.varEstimate = 0;
    } else {
      const residual = v - this.meanEstimate;
      const sigma = Math.sqrt(this.varEstimate);
      if (this.count >= this.warmup && sigma > 0) {
        const z = Math.abs(residual) / sigma;
        if (z > this.threshold) {
          anomaly = {
            index: -1,
            timestamp: point.timestamp,
            value: v,
            score: z,
            severity: Math.min(1, z / (this.threshold * 2)),
            detector: this.name,
            explanation: `EWMA residual ${residual.toFixed(2)} = ${z.toFixed(2)}σ (forecast=${this.meanEstimate.toFixed(2)})`,
          };
        }
      }
      // update estimates — skip updating on anomalies to avoid contaminating
      // the model (standard practice: clip or skip the observation)
      if (anomaly === null) {
        this.meanEstimate = this.alpha * v + (1 - this.alpha) * this.meanEstimate;
        this.varEstimate =
          this.alpha * residual * residual + (1 - this.alpha) * this.varEstimate;
      }
    }
    this.count++;
    return anomaly;
  }

  detect(series: readonly DataPoint[]): Anomaly[] {
    this.reset();
    const anomalies: Anomaly[] = [];
    for (let i = 0; i < series.length; i++) {
      const a = this.update(series[i]);
      if (a !== null) {
        anomalies.push({ ...a, index: i, timestamp: series[i].timestamp });
      }
    }
    return anomalies;
  }

  reset(): void {
    this.meanEstimate = 0;
    this.varEstimate = 0;
    this.count = 0;
  }

  getMeanEstimate(): number {
    return this.meanEstimate;
  }
}

export interface CusumOptions {
  /** reference value k (half the shift to detect, in sigma units) */
  readonly reference?: number;
  /** decision interval h in sigma units */
  readonly threshold?: number;
  /** points used to estimate baseline mean/stddev */
  readonly baselineWindow?: number;
}

/**
 * CUSUM change detector: accumulates standardized deviations to detect
 * sustained shifts in mean. Reports when the cumulative sum exceeds h.
 */
export class CusumDetector implements IBatchDetector {
  readonly name = 'cusum';
  private readonly reference: number;
  private readonly threshold: number;
  private readonly baselineWindow: number;

  constructor(options: CusumOptions = {}) {
    this.reference = options.reference ?? 0.5;
    this.threshold = options.threshold ?? 5;
    this.baselineWindow = options.baselineWindow ?? 20;
  }

  detect(series: readonly DataPoint[]): Anomaly[] {
    const anomalies: Anomaly[] = [];
    if (series.length <= this.baselineWindow) return anomalies;
    const baseline = series.slice(0, this.baselineWindow).map((p) => p.value);
    const mu = mean(baseline);
    const sigma = stddev(baseline);
    if (sigma === 0) return anomalies;
    let cPos = 0;
    let cNeg = 0;
    for (let i = this.baselineWindow; i < series.length; i++) {
      const z = (series[i].value - mu) / sigma;
      cPos = Math.max(0, cPos + z - this.reference);
      cNeg = Math.min(0, cNeg + z + this.reference);
      const c = Math.max(cPos, Math.abs(cNeg));
      if (c > this.threshold) {
        anomalies.push({
          index: i,
          timestamp: series[i].timestamp,
          value: series[i].value,
          score: c,
          severity: Math.min(1, c / (this.threshold * 2)),
          detector: this.name,
          explanation: `CUSUM ${c.toFixed(2)} > h=${this.threshold}: sustained shift from baseline ${mu.toFixed(2)}`,
        });
        // reset after alarm to detect subsequent shifts
        cPos = 0;
        cNeg = 0;
      }
    }
    return anomalies;
  }
}
