import { describe, it, expect } from 'bun:test';
import { DataPoint } from '../implementations/detectors/Types';
import {
  ZScoreDetector,
  IqrDetector,
  GrubbsDetector,
} from '../implementations/detectors/StatisticalDetectors';
import {
  MovingAverageDetector,
  EwmaDetector,
  CusumDetector,
} from '../implementations/detectors/StreamingDetectors';
import { IsolationForest, cFactor } from '../implementations/detectors/IsolationForest';
import {
  seasonalDecompose,
  SeasonalDetector,
  RobustSeasonalDetector,
} from '../implementations/detectors/Seasonal';
import { mean, stddev, median, quantile } from '../implementations/detectors/Types';

function series(values: number[]): DataPoint[] {
  return values.map((v, i) => ({ timestamp: i * 1000, value: v }));
}

function normalSeries(n: number, base = 50): DataPoint[] {
  // pseudo-random but deterministic-ish values clustered around base
  const out: DataPoint[] = [];
  for (let i = 0; i < n; i++) {
    const v = base + Math.sin(i * 0.7) * 2 + Math.cos(i * 1.3) * 1.5;
    out.push({ timestamp: i, value: v });
  }
  return out;
}

describe('stats helpers', () => {
  it('mean/stddev/median/quantile', () => {
    const v = [1, 2, 3, 4, 5];
    expect(mean(v)).toBe(3);
    expect(median(v)).toBe(3);
    expect(quantile(v, 0.25)).toBeCloseTo(2);
    expect(stddev(v)).toBeCloseTo(1.5811, 3);
  });
});

describe('ZScoreDetector', () => {
  it('flags obvious outliers', () => {
    const data = series([50, 51, 49, 52, 50, 200, 49, 51, 50, 48]);
    const det = new ZScoreDetector({ threshold: 2.5 });
    const anomalies = det.detect(data);
    expect(anomalies.length).toBe(1);
    expect(anomalies[0].index).toBe(5);
    expect(anomalies[0].value).toBe(200);
  });

  it('robust variant resists contamination', () => {
    const data = series([50, 51, 49, 52, 50, 200, 49, 51, 50, 48, 51, 49]);
    const det = new ZScoreDetector({ threshold: 3, robust: true });
    const anomalies = det.detect(data);
    expect(anomalies.length).toBe(1);
  });

  it('no false positives on stable data', () => {
    const data = normalSeries(100);
    const det = new ZScoreDetector({ threshold: 3 });
    expect(det.detect(data).length).toBe(0);
  });
});

describe('IqrDetector', () => {
  it('flags points outside fences', () => {
    const data = series([10, 11, 12, 10, 11, 12, 10, 11, 100]);
    const det = new IqrDetector();
    const anomalies = det.detect(data);
    expect(anomalies.some((a) => a.value === 100)).toBe(true);
  });

  it('respects extreme multiplier', () => {
    const data = series([10, 11, 12, 10, 11, 12, 10, 11, 20]);
    const loose = new IqrDetector({ multiplier: 3 });
    const tight = new IqrDetector({ multiplier: 1.5 });
    expect(loose.detect(data).length).toBeLessThanOrEqual(
      tight.detect(data).length
    );
  });
});

describe('GrubbsDetector', () => {
  it('finds a single outlier', () => {
    const data = series([10, 10.5, 9.5, 10.2, 9.8, 10.1, 50]);
    const det = new GrubbsDetector();
    const anomalies = det.detect(data);
    expect(anomalies.length).toBe(1);
    expect(anomalies[0].value).toBe(50);
  });
});

describe('MovingAverageDetector', () => {
  it('flags spikes vs trailing window', () => {
    const values = [50, 51, 50, 49, 51, 50, 50, 51, 49, 50, 120];
    const det = new MovingAverageDetector({ window: 10, threshold: 3 });
    const anomalies = det.detect(series(values));
    expect(anomalies.length).toBe(1);
    expect(anomalies[0].index).toBe(10);
  });
});

describe('EwmaDetector', () => {
  it('flags sudden jumps after warmup', () => {
    const det = new EwmaDetector({ alpha: 0.3, threshold: 3, warmup: 5 });
    const values = [50, 50.5, 49.8, 50.2, 50.1, 49.9, 50.3, 49.7, 50, 50.2, 80];
    const anomalies = det.detect(series(values));
    expect(anomalies.some((a) => a.index === 10)).toBe(true);
  });

  it('streams without false positives on stable input', () => {
    const det = new EwmaDetector({ alpha: 0.2, threshold: 4, warmup: 5 });
    let flagged = 0;
    for (let i = 0; i < 50; i++) {
      const a = det.update({ timestamp: i, value: 50 + (i % 2) * 0.1 });
      if (a !== null) flagged++;
    }
    expect(flagged).toBe(0);
  });
});

describe('CusumDetector', () => {
  it('detects sustained level shift', () => {
    // baseline around 10, then shift to 15
    const values = [
      ...Array.from({ length: 20 }, (_, i) => 10 + (i % 3) * 0.2),
      ...Array.from({ length: 15 }, (_, i) => 15 + (i % 3) * 0.2),
    ];
    const det = new CusumDetector({ baselineWindow: 20, threshold: 4 });
    const anomalies = det.detect(series(values));
    expect(anomalies.length).toBeGreaterThan(0);
    expect(anomalies[0].index).toBeGreaterThanOrEqual(20);
  });
});

describe('IsolationForest', () => {
  it('scores outliers higher than normal points', () => {
    const samples: number[][] = [];
    for (let i = 0; i < 100; i++) {
      samples.push([50 + Math.sin(i) * 2, 30 + Math.cos(i) * 2]);
    }
    const forest = new IsolationForest({ trees: 50, subsampleSize: 50, seed: 1 });
    forest.fit(samples);
    const normalScore = forest.score([50, 30]);
    const outlierScore = forest.score([200, -100]);
    expect(outlierScore).toBeGreaterThan(normalScore);
    expect(outlierScore).toBeGreaterThan(0.5);
  });

  it('detects anomalies in 1-D series', () => {
    const values = normalSeries(60).map((p) => p.value);
    values[30] = 500;
    const data = series(values);
    const forest = new IsolationForest({
      trees: 50,
      subsampleSize: 30,
      threshold: 0.55,
      seed: 2,
    });
    const anomalies = forest.detect(data);
    expect(anomalies.some((a) => a.index === 30)).toBe(true);
  });

  it('cFactor is sane', () => {
    expect(cFactor(1)).toBe(0);
    expect(cFactor(2)).toBe(1);
    expect(cFactor(256)).toBeGreaterThan(5);
  });
});

describe('Seasonal', () => {
  it('decomposes a seasonal series', () => {
    // period 7 weekly pattern
    const pattern = [10, 12, 15, 20, 25, 18, 8];
    const values: number[] = [];
    for (let w = 0; w < 8; w++) {
      for (const p of pattern) values.push(p + w * 0.5); // slight upward trend
    }
    const dec = seasonalDecompose(series(values), 7);
    expect(dec.trend.filter((t) => t !== null).length).toBeGreaterThan(0);
    // seasonal component should roughly repeat
    expect(dec.seasonal[0]).toBeCloseTo(dec.seasonal[7], 5);
  });

  it('SeasonalDetector flags out-of-pattern spikes', () => {
    const pattern = [10, 12, 15, 20, 25, 18, 8];
    const values: number[] = [];
    for (let w = 0; w < 6; w++) values.push(...pattern);
    values[20] = 90; // spike mid-series
    const det = new SeasonalDetector({ period: 7, threshold: 3 });
    const anomalies = det.detect(series(values));
    expect(anomalies.some((a) => a.index === 20)).toBe(true);
  });

  it('RobustSeasonalDetector flags spikes', () => {
    const pattern = [10, 12, 15, 20, 25, 18, 8];
    const values: number[] = [];
    for (let w = 0; w < 6; w++) values.push(...pattern);
    values[25] = 95;
    const det = new RobustSeasonalDetector({ period: 7, threshold: 3 });
    const anomalies = det.detect(series(values));
    expect(anomalies.some((a) => a.index === 25)).toBe(true);
  });
});
