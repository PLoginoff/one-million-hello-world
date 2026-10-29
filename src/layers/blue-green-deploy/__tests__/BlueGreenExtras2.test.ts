/**
 * Blue-Green Deploy extras 2 — unit tests (bun:test)
 */

import { describe, it, expect } from 'bun:test';
import { DeploymentHistory } from '../deploy/DeploymentHistory';
import { StagedTrafficGate } from '../deploy/StagedTrafficGate';
import { DeploymentRecord, DeploymentState, EnvColor } from '../deploy/BlueGreenTypes';

function fakeClock(start = 0): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

function rec(finalState: DeploymentState, startedAt = 0, rolledBackAt?: number): DeploymentRecord {
  return {
    deploymentId: `d-${startedAt}`,
    version: 'v',
    targetEnv: EnvColor.GREEN,
    transitions: rolledBackAt !== undefined
      ? [{ from: DeploymentState.SHIFTING, to: DeploymentState.ROLLING_BACK, at: rolledBackAt, reason: 'x' }]
      : [],
    smokeResults: [],
    finalState,
    rolledBack: finalState === DeploymentState.ROLLED_BACK,
    startedAt,
    finishedAt: startedAt + 100,
  };
}

// ------------------------------------------------------------ DeploymentHistory

describe('DeploymentHistory', () => {
  it('aggregates outcome counts and success rate', () => {
    const h = new DeploymentHistory();
    h.record(rec(DeploymentState.COMPLETE));
    h.record(rec(DeploymentState.COMPLETE));
    h.record(rec(DeploymentState.ROLLED_BACK));
    h.record(rec(DeploymentState.FAILED));
    const s = h.stats();
    expect(s.total).toBe(4);
    expect(s.completed).toBe(2);
    expect(s.successRate).toBe(0.5);
  });

  it('computes mean time to detect rollback', () => {
    const clk = fakeClock();
    const h = new DeploymentHistory(clk.now);
    h.record(rec(DeploymentState.ROLLED_BACK, 0, 500));
    h.record(rec(DeploymentState.ROLLED_BACK, 0, 1500));
    expect(h.stats().meanDetectionMs).toBe(1000);
  });

  it('buckets deploys by day of week', () => {
    const h = new DeploymentHistory();
    // 2024-01-05 is a Friday (day 5).
    h.record(rec(DeploymentState.COMPLETE, Date.UTC(2024, 0, 5)));
    h.record(rec(DeploymentState.COMPLETE, Date.UTC(2024, 0, 6))); // Sat
    const s = h.stats();
    expect(s.byDayOfWeek[5]).toBe(1);
    expect(s.byDayOfWeek[6]).toBe(1);
  });

  it('recentInstability flags rollback/failure inside window', () => {
    const clk = fakeClock();
    const h = new DeploymentHistory(clk.now);
    h.record(rec(DeploymentState.COMPLETE, 0));
    expect(h.recentInstability(1000)).toBe(false);
    h.record(rec(DeploymentState.FAILED, 0));
    expect(h.recentInstability(1000)).toBe(true);
  });
});

// ------------------------------------------------------------ StagedTrafficGate

describe('StagedTrafficGate', () => {
  it('blocks advance until min soak elapses', () => {
    const clk = fakeClock();
    const g = new StagedTrafficGate([{ budgetFraction: 0.1, minSoakMs: 1000 }], clk.now);
    g.observe(0, 100);
    expect(g.evaluate().mayAdvance).toBe(false);
    expect(g.evaluate().soakRemainingMs).toBe(1000);
    clk.advance(1000);
    expect(g.evaluate().mayAdvance).toBe(true);
  });

  it('burn rate >1 blocks advance even after soak', () => {
    const clk = fakeClock();
    const g = new StagedTrafficGate([{ budgetFraction: 0.05, minSoakMs: 0 }], clk.now);
    g.observe(10, 100); // 10% errors > 5% budget → burn 2.0
    expect(g.evaluate().mayAdvance).toBe(false);
    expect(g.evaluate().burnRate).toBe(2);
  });

  it('advance resets counters per step', () => {
    const clk = fakeClock();
    const g = new StagedTrafficGate(
      [
        { budgetFraction: 0.1, minSoakMs: 0 },
        { budgetFraction: 0.1, minSoakMs: 0 },
      ],
      clk.now
    );
    g.observe(5, 100);
    expect(g.advance()).toBe(true);
    expect(g.stepIndex).toBe(1);
    expect(g.evaluate().observedErrors).toBe(0);
  });
});
