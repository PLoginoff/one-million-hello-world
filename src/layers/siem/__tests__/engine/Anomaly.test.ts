/**
 * Anomaly detection tests.
 */

import { describe, it, expect } from 'bun:test';
import { ManualClock } from '../../../observability/engine/signals';
import { AnomalyDetector, NormalizedEvent } from '../../engine';

let seq = 0;
function evt(user: string, action: string, ts: number): NormalizedEvent {
  return {
    id: ++seq, timestampMs: ts, raw: 'x', severity: 'info', outcome: 'success',
    fields: {}, parseQuality: 'full', user, action,
  };
}

describe('AnomalyDetector', () => {
  it('flags a sudden burst after a quiet baseline', () => {
    const clock = new ManualClock(0);
    const det = new AnomalyDetector(
      { bucketMs: 1_000, windowCount: 20, zThreshold: 2, minCount: 5 },
      clock
    );
    // Quiet baseline: 1 event/min for 20 minutes.
    for (let i = 0; i < 20; i++) {
      det.ingest(evt('u1', 'login', i * 1_000));
    }
    // Burst: 15 events in the next bucket — far above baseline.
    let anomaly = null;
    for (let i = 0; i < 15; i++) {
      const r = det.ingest(evt('u1', 'login', 21_000));
      if (r) anomaly = r;
    }
    expect(anomaly).not.toBeNull();
    expect(anomaly!.count).toBeGreaterThanOrEqual(5);
    expect(anomaly!.zScore).toBeGreaterThanOrEqual(2);
  });

  it('does not flag steady traffic', () => {
    const clock = new ManualClock(0);
    const det = new AnomalyDetector(
      { bucketMs: 1_000, windowCount: 10, zThreshold: 5, minCount: 3 },
      clock
    );
    for (let i = 0; i < 30; i++) {
      expect(det.ingest(evt('u1', 'login', i * 1_000))).toBeNull();
    }
  });

  it('tracks separate baselines per key', () => {
    const clock = new ManualClock(0);
    const det = new AnomalyDetector({ bucketMs: 1_000, windowCount: 10 }, clock);
    for (let i = 0; i < 10; i++) {
      det.ingest(evt('alice', 'login', i * 1_000));
      det.ingest(evt('bob', 'file-read', i * 1_000));
    }
    expect(det.baseline('alice|login')).toBeDefined();
    expect(det.baseline('bob|file-read')).toBeDefined();
    expect(det.baseline('carol|login')).toBeUndefined();
  });
});
