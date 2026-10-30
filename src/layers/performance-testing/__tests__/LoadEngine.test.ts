/**
 * LoadEngine tests — schedules, VU lifecycle, thresholds, spike/soak.
 */

import { describe, it, expect } from 'bun:test';
import {
  LoadSchedule,
  LoadEngine,
  VirtualUser,
  ConstantThinkTime,
  UniformThinkTime,
  ExponentialThinkTime,
  mulberry32,
} from '../engine/index';

describe('LoadSchedule', () => {
  it('constant load stays level', () => {
    const s = LoadSchedule.constant(10, 5000);
    expect(s.activeUsers(0)).toBe(10);
    expect(s.activeUsers(4999)).toBe(10);
    expect(s.activeUsers(5000)).toBe(0);
    expect(s.totalMs).toBe(5000);
  });

  it('ramp interpolates linearly', () => {
    const s = LoadSchedule.ramp(100, 1000, 2000, 1000);
    expect(s.activeUsers(0)).toBe(0);
    expect(s.activeUsers(500)).toBeCloseTo(50, 5);
    expect(s.activeUsers(1500)).toBe(100);
    expect(s.activeUsers(3500)).toBeCloseTo(50, 5);
    expect(s.peakUsers()).toBe(100);
  });

  it('spike jumps sharply then recovers', () => {
    const s = LoadSchedule.spike(10, 200, 1000, 500, 1000);
    expect(s.activeUsers(500)).toBe(10);
    expect(s.activeUsers(1500)).toBe(200);
    expect(s.activeUsers(2499)).toBeCloseTo(10, 5);
    expect(s.peakUsers()).toBe(200);
  });

  it('step produces equal increments', () => {
    const s = LoadSchedule.step(10, 20, 3, 100);
    expect(s.activeUsers(50)).toBe(10);
    expect(s.activeUsers(150)).toBe(30);
    expect(s.activeUsers(250)).toBe(50);
  });

  it('soak has warmup + long hold + cooldown', () => {
    const s = LoadSchedule.soak(50, 10_000, 1_000);
    expect(s.activeUsers(500)).toBeCloseTo(25, 5);
    expect(s.activeUsers(5000)).toBe(50);
    expect(s.totalMs).toBe(12_000);
  });
});

describe('VirtualUser', () => {
  it('cycles idle → waiting → thinking → idle', () => {
    const vu = new VirtualUser(1, new ConstantThinkTime(100), mulberry32(1));
    expect(vu.ready(0)).toBe(true);
    vu.startRequest(0);
    expect(vu.state).toBe('waiting');
    expect(() => vu.startRequest(0)).toThrow();
    vu.complete(50);
    expect(vu.state).toBe('thinking');
    expect(vu.ready(149)).toBe(false);
    expect(vu.ready(150)).toBe(true);
    expect(vu.state).toBe('idle');
  });

  it('think-time models sample different distributions', () => {
    const c = new ConstantThinkTime(50);
    expect(c.sample(mulberry32(1))).toBe(50);
    const u = new UniformThinkTime(10, 20);
    const r = mulberry32(1);
    for (let i = 0; i < 100; i++) {
      const v = u.sample(r);
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThanOrEqual(20);
    }
    const e = new ExponentialThinkTime(100);
    let sum = 0;
    for (let i = 0; i < 2000; i++) sum += e.sample(r);
    expect(sum / 2000).toBeGreaterThan(80);
    expect(sum / 2000).toBeLessThan(120);
  });
});

describe('LoadEngine — basic run', () => {
  const scenario = { name: 'ping', weight: 1, execute: () => 25 };

  it('runs constant load and records stats', async () => {
    const report = await new LoadEngine({
      schedule: LoadSchedule.constant(5, 3000),
      scenarios: [scenario],
      seed: 1,
    }).run();
    expect(report.totalRequests).toBeGreaterThan(0);
    expect(report.totalErrors).toBe(0);
    expect(report.latency.p50).toBe(25);
    expect(report.aborted).toBe(false);
    expect(report.passed).toBe(true);
    expect(report.timeline.length).toBeGreaterThanOrEqual(3);
  });

  it('is deterministic under a fixed seed', async () => {
    const opts = {
      schedule: LoadSchedule.ramp(10, 500, 1000, 500),
      scenarios: [
        {
          name: 'x',
          weight: 1,
          execute: () => 30,
        },
      ],
      seed: 42,
    };
    const a = await new LoadEngine(opts).run();
    const b = await new LoadEngine(opts).run();
    expect(a.totalRequests).toBe(b.totalRequests);
    expect(a.latency).toEqual(b.latency);
  });

  it('weighted scenarios distribute requests', async () => {
    const counts: Record<string, number> = { a: 0, b: 0 };
    const report = await new LoadEngine({
      schedule: LoadSchedule.constant(10, 2000),
      scenarios: [
        { name: 'a', weight: 9, execute: () => { counts.a++; return 1; } },
        { name: 'b', weight: 1, execute: () => { counts.b++; return 1; } },
      ],
      seed: 5,
    }).run();
    expect(counts.a / report.totalRequests).toBeGreaterThan(0.75);
    expect(counts.b).toBeGreaterThan(0);
  });
});

describe('LoadEngine — thresholds and errors', () => {
  it('passes/fails latency thresholds', async () => {
    const report = await new LoadEngine({
      schedule: LoadSchedule.constant(5, 1000),
      scenarios: [{ name: 's', weight: 1, execute: () => 100 }],
      thresholds: [{ metric: 'latency.p99', op: '<', value: 500 }],
      seed: 1,
    }).run();
    expect(report.thresholdResults[0]?.ok).toBe(true);
    expect(report.passed).toBe(true);

    const failing = await new LoadEngine({
      schedule: LoadSchedule.constant(5, 1000),
      scenarios: [{ name: 's', weight: 1, execute: () => 1000 }],
      thresholds: [{ metric: 'latency.p99', op: '<', value: 500 }],
      seed: 1,
    }).run();
    expect(failing.thresholdResults[0]?.ok).toBe(false);
    expect(failing.passed).toBe(false);
  });

  it('aborts on error-rate breach', async () => {
    let calls = 0;
    const report = await new LoadEngine({
      schedule: LoadSchedule.constant(10, 60_000),
      scenarios: [
        {
          name: 'flaky',
          weight: 1,
          execute: () => {
            calls++;
            if (calls % 2 === 0) throw new Error('boom');
            return 10;
          },
        },
      ],
      thresholds: [{ metric: 'errors.rate', op: '<', value: 0.4, abortOnBreach: true }],
      seed: 1,
    }).run();
    expect(report.aborted).toBe(true);
    expect(report.abortReason).toContain('errors.rate');
    expect(report.durationMs).toBeLessThan(60_000);
    expect(report.errorRate).toBeGreaterThan(0.4);
  });

  it('records thrown scenario errors by class', async () => {
    const report = await new LoadEngine({
      schedule: LoadSchedule.constant(3, 500),
      scenarios: [
        { name: 'bad', weight: 1, execute: () => { throw new Error('500'); } },
      ],
      seed: 1,
    }).run();
    expect(report.totalErrors).toBe(report.totalRequests);
    expect(report.errorsByClass.get('other')).toBe(report.totalRequests);
    expect(report.recentErrors.length).toBeGreaterThan(0);
  });
});

describe('LoadEngine — spike pattern', () => {
  it('shows load surge in the timeline', async () => {
    const report = await new LoadEngine({
      schedule: LoadSchedule.spike(2, 40, 2000, 2000, 2000),
      scenarios: [{ name: 's', weight: 1, execute: () => 5 }],
      timelineBucketMs: 1000,
      seed: 3,
    }).run();
    // find the bucket with max active users — should be during spike
    const peak = report.timeline.reduce((a, b) => (b.activeUsers > a.activeUsers ? b : a));
    expect(peak.activeUsers).toBeGreaterThanOrEqual(35);
    const baseline = report.timeline[0];
    expect(baseline?.activeUsers).toBeLessThanOrEqual(3);
  });
});
