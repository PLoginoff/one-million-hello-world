/**
 * BiometricAnalyzer — behavioral biometrics.
 *
 * The layer's `TimingEntropySignal` measures inter-REQUEST gaps —
 * coarse, per-IP. This analyzer measures *within-gesture* timing:
 * the microstructure humans produce and bots can't fake cheaply.
 *
 * Keystroke dynamics:
 *   - dwell entropy: humans hit keys with variable hold times;
 *     bots sample from narrow distributions. Shannon entropy of the
 *     binned dwell distribution — low entropy = scripted.
 *   - flight CV: coefficient of variation of key-to-key gaps.
 *     Humans pause to think (high CV); bots are metronomic (CV→0).
 *
 * Mouse path analysis (stub-quality but real math):
 *   - linearity: path-length / bounding-diagonal. Humans wander
 *     (linearity ≈ 0.6–0.9 with jitter); linear-interpolated bot
 *     paths hit ≈ 1.0 suspiciously exactly.
 *   - speed CV: humans accelerate/decelerate (high); constant-speed
 *     synthetic paths sit near 0.
 *
 * Score is the weighted worst-signal blend — the standard ensemble
 * approach where one strongly-bot feature should dominate.
 *
 * @module BotDetectionLayer/Engine
 */

import {
  BiometricAssessment,
  BiometricFeatures,
  Keystroke,
  MousePoint,
} from './types';

export class BiometricAnalyzer {
  /**
   * Score a keystroke sequence. Needs ≥4 keys for a meaningful
   * distribution — below that returns a neutral 0.5 (insufficient
   * data is not evidence either way).
   */
  analyzeKeystrokes(keys: readonly Keystroke[]): BiometricAssessment {
    const features = this._keystrokeFeatures(keys);
    const reasons: string[] = [];
    let score = 0;
    let weight = 0;

    if (features.samples < 4) {
      return { score: 0.5, reasons: ['insufficient keystroke data'], features };
    }

    // Low dwell entropy → scripted. Humans: entropy > ~2.5 bits.
    if (features.dwellEntropy < 1.0) {
      score += 0.9;
      weight += 1;
      reasons.push(
        `dwell entropy ${features.dwellEntropy.toFixed(2)} bits — near-constant hold times`
      );
    } else if (features.dwellEntropy < 2.0) {
      score += 0.5;
      weight += 1;
      reasons.push(`low dwell entropy ${features.dwellEntropy.toFixed(2)}`);
    } else {
      weight += 1;
    }

    // Low flight CV → metronomic. Humans: CV > ~0.4.
    if (features.flightCv < 0.1) {
      score += 0.9;
      weight += 1;
      reasons.push(
        `flight CV ${features.flightCv.toFixed(2)} — metronomic typing`
      );
    } else if (features.flightCv < 0.25) {
      score += 0.5;
      weight += 1;
      reasons.push(`uniform flight times (CV ${features.flightCv.toFixed(2)})`);
    } else {
      weight += 1;
    }

    return { score: weight > 0 ? score / weight : 0.5, reasons, features };
  }

  /**
   * Score a mouse path. Linearity near-perfect + near-zero speed
   * variance = synthesized path.
   */
  analyzeMousePath(points: readonly MousePoint[]): BiometricAssessment {
    const features = this._mouseFeatures(points);
    const reasons: string[] = [];
    if (points.length < 5) {
      return { score: 0.5, reasons: ['insufficient mouse data'], features };
    }

    let score = 0;
    let weight = 0;

    if (features.linearity > 0.99) {
      score += 0.85;
      weight += 1;
      reasons.push(
        `path linearity ${features.linearity.toFixed(3)} — unnaturally straight`
      );
    } else {
      weight += 1;
    }

    if (features.speedCv < 0.05) {
      score += 0.85;
      weight += 1;
      reasons.push(
        `speed CV ${features.speedCv.toFixed(3)} — constant-velocity path`
      );
    } else if (features.speedCv < 0.2) {
      score += 0.4;
      weight += 1;
      reasons.push(`low speed variance (CV ${features.speedCv.toFixed(2)})`);
    } else {
      weight += 1;
    }

    return { score: weight > 0 ? score / weight : 0.5, reasons, features };
  }

  /* ---------------------------------------------------------------- */

  private _keystrokeFeatures(keys: readonly Keystroke[]): BiometricFeatures {
    const dwells = keys.map((k) => k.dwellMs);
    const flights = keys.slice(1).map((k) => k.flightMs);
    return {
      dwellEntropy: histogramEntropy(dwells, 8),
      flightCv: cv(flights),
      linearity: 0,
      speedCv: 0,
      samples: keys.length,
    };
  }

  private _mouseFeatures(points: readonly MousePoint[]): BiometricFeatures {
    if (points.length < 2) {
      return {
        dwellEntropy: 0,
        flightCv: 0,
        linearity: 0,
        speedCv: 0,
        samples: points.length,
      };
    }
    let pathLen = 0;
    let minX = points[0].x;
    let maxX = points[0].x;
    let minY = points[0].y;
    let maxY = points[0].y;
    const speeds: number[] = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      pathLen += d;
      const dt = (b.t - a.t) / 1000;
      if (dt > 0) speeds.push(d / dt);
      minX = Math.min(minX, b.x);
      maxX = Math.max(maxX, b.x);
      minY = Math.min(minY, b.y);
      maxY = Math.max(maxY, b.y);
    }
    const diagonal = Math.hypot(maxX - minX, maxY - minY);
    return {
      dwellEntropy: 0,
      flightCv: 0,
      // diagonal/pathLength → 1.0 for a perfectly straight path,
      // →0 for a wildly wandering one.
      linearity:
        diagonal > 0 && pathLen > 0
          ? Math.min(1, diagonal / pathLen)
          : 0,
      speedCv: cv(speeds),
      samples: points.length,
    };
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Coefficient of variation σ/μ; 0 for n<2 or μ=0. */
function cv(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((s, v) => s + v, 0) / xs.length;
  if (mean === 0) return 0;
  const varr = xs.reduce((s, v) => s + (v - mean) ** 2, 0) / xs.length;
  return Math.sqrt(varr) / mean;
}

/**
 * Shannon entropy of a value distribution binned into `bins` cells
 * across [min,max]. Bits. 0 for <2 samples.
 */
function histogramEntropy(xs: readonly number[], bins: number): number {
  if (xs.length < 2) return 0;
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  const span = max - min;
  if (span === 0) return 0; // constant → zero entropy
  const counts = new Array<number>(bins).fill(0);
  for (const v of xs) {
    const b = Math.min(bins - 1, Math.floor(((v - min) / span) * bins));
    counts[b]++;
  }
  let h = 0;
  for (const c of counts) {
    if (c === 0) continue;
    const p = c / xs.length;
    h -= p * Math.log2(p);
  }
  return h;
}
