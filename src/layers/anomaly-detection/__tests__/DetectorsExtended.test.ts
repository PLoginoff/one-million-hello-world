import { describe, it, expect } from 'bun:test';
import { DataPoint } from '../implementations/detectors/Types';
import { Dbscan, LofDetector, euclideanDistance } from '../implementations/clustering/Dbscan';
import {
  fitGaussian,
  mahalanobisSquared,
  MahalanobisDetector,
  invertMatrix,
} from '../implementations/multivariate/Gaussian';
import {
  PageHinkleyTest,
  KolmogorovSmirnovDetector,
  ArAnomalyDetector,
  ksStatistic,
} from '../implementations/drift/DriftDetectors';

function series(values: number[]): DataPoint[] {
  return values.map((v, i) => ({ timestamp: i, value: v }));
}

describe('Dbscan', () => {
  it('clusters dense groups, flags noise', () => {
    const samples: number[][] = [
      // cluster around (0,0)
      [0, 0], [0.2, 0.1], [-0.1, 0.2], [0.1, -0.1], [0, -0.2],
      // cluster around (10,10)
      [10, 10], [10.2, 10.1], [9.9, 10.2], [10.1, 9.9], [10, 9.8],
      // outlier
      [50, 50],
    ];
    const db = new Dbscan(1, 3);
    const { labels, clusterCount, noiseIndices } = db.fit(samples);
    expect(clusterCount).toBe(2);
    expect(labels[10]).toBe(-1);
    expect(noiseIndices).toContain(10);
  });
});

describe('LofDetector', () => {
  it('scores outliers higher than inliers', () => {
    const samples: number[][] = [
      [0, 0], [0.1, 0], [0, 0.1], [0.1, 0.1], [-0.1, 0], [0, -0.1],
      [1, 0], [0.9, 0.1], [1.1, 0], [1, 0.1],
      [30, 30], // outlier
    ];
    const lof = new LofDetector(3);
    const scores = lof.scores(samples);
    expect(scores[10]).toBeGreaterThan(scores[0]);
  });
});

describe('Mahalanobis/Gaussian', () => {
  it('invertMatrix produces inverse', () => {
    const m = [[2, 0], [0, 4]];
    const inv = invertMatrix(m);
    expect(inv[0][0]).toBeCloseTo(0.5);
    expect(inv[1][1]).toBeCloseTo(0.25);
  });

  it('fitGaussian + mahalanobisSquared flags outliers', () => {
    const samples: number[][] = [];
    for (let i = 0; i < 50; i++) {
      samples.push([50 + Math.sin(i) * 2, 30 + Math.cos(i) * 2]);
    }
    const model = fitGaussian(samples);
    const dNormal = mahalanobisSquared(model, [50, 30]);
    const dOutlier = mahalanobisSquared(model, [200, -100]);
    expect(dOutlier).toBeGreaterThan(dNormal * 100);
  });

  it('MahalanobisDetector flags via p-value', () => {
    const samples: number[][] = [];
    for (let i = 0; i < 80; i++) {
      samples.push([Math.sin(i * 0.3), Math.cos(i * 0.3), (i % 7) * 0.1]);
    }
    const det = new MahalanobisDetector({ alpha: 0.001 });
    det.fit(samples);
    expect(det.isAnomaly([0, 0, 0.3])).toBe(false);
    expect(det.isAnomaly([50, 50, 50])).toBe(true);
  });
});

describe('Drift detectors', () => {
  it('PageHinkley detects mean shift', () => {
    const ph = new PageHinkleyTest({ delta: 0.5, lambda: 30 });
    const values = [
      ...Array.from({ length: 60 }, (_, i) => 10 + (i % 3) * 0.1),
      ...Array.from({ length: 60 }, (_, i) => 25 + (i % 3) * 0.1),
    ];
    const anomalies = ph.detect(series(values));
    expect(anomalies.length).toBeGreaterThan(0);
    expect(anomalies[0].index).toBeGreaterThanOrEqual(60);
  });

  it('ksStatistic is 0 for identical, 1 for disjoint', () => {
    const a = [1, 2, 3, 4, 5];
    expect(ksStatistic(a, a)).toBe(0);
    const b = [10, 20, 30];
    expect(ksStatistic(a, b)).toBe(1);
  });

  it('KS detector flags distribution shift', () => {
    const det = new KolmogorovSmirnovDetector({
      referenceSize: 40,
      windowSize: 20,
      threshold: 0.4,
    });
    const values = [
      ...Array.from({ length: 40 }, (_, i) => 10 + (i % 5) * 0.5),
      ...Array.from({ length: 30 }, () => 90),
    ];
    const anomalies = det.detect(series(values));
    expect(anomalies.length).toBeGreaterThan(0);
  });

  it('AR detector flags forecast residuals', () => {
    // predictable oscillation + spike
    const values: number[] = [];
    for (let i = 0; i < 60; i++) values.push(50 + Math.sin(i * 0.4) * 3);
    values[40] = 90;
    const det = new ArAnomalyDetector({ arOrder: 4, threshold: 3 });
    const anomalies = det.detect(series(values));
    expect(anomalies.some((a) => a.index === 40)).toBe(true);
  });
});
