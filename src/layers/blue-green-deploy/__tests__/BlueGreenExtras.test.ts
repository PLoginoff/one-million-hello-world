/**
 * Blue-Green Deploy extras — unit tests (bun:test)
 */

import { describe, it, expect } from 'bun:test';
import { DriftChecker } from '../deploy/DriftChecker';
import { WavePlanner } from '../deploy/WavePlanner';
import { VersionRegistry } from '../deploy/VersionRegistry';
import { EnvColor } from '../deploy/BlueGreenTypes';

function fakeClock(start = 0): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

// ----------------------------------------------------------------- DriftChecker

describe('DriftChecker', () => {
  it('detects added, removed, and changed keys', () => {
    const d = new DriftChecker();
    const report = d.diff(
      { a: '1', b: '2', c: '3' },
      { a: '1', b: 'changed', d: 'new' }
    );
    expect(report.drifted).toBe(true);
    const kinds = new Map(report.entries.map((e) => [e.key, e.kind]));
    expect(kinds.get('b')).toBe('changed');
    expect(kinds.get('c')).toBe('removed');
    expect(kinds.get('d')).toBe('added');
    expect(report.identicalKeys).toBe(1);
  });

  it('no drift on identical specs', () => {
    const d = new DriftChecker();
    const r = d.diff({ a: 1, b: true }, { a: 1, b: true });
    expect(r.drifted).toBe(false);
    expect(r.driftScore).toBe(0);
  });

  it('secret keys weigh double in the drift score', () => {
    const d = new DriftChecker();
    const benign = d.diff({ flag: 'a', x: '1' }, { flag: 'b', x: '1' });
    const secret = d.diff({ db_password: 'a', x: '1' }, { db_password: 'b', x: '1' });
    expect(secret.driftScore).toBeGreaterThan(benign.driftScore);
  });

  it('tolerated keys are excluded from acceptability', () => {
    const d = new DriftChecker();
    const r = d.diff({ ts: '1' }, { ts: '2' });
    expect(d.acceptable(r, 0, ['ts'])).toBe(true);
    expect(d.acceptable(r, 0, [])).toBe(false);
  });
});

// ------------------------------------------------------------------ WavePlanner

describe('WavePlanner', () => {
  it('orders services into dependency waves (Kahn)', () => {
    const plan = WavePlanner.plan([
      { serviceId: 'db', dependsOn: [] },
      { serviceId: 'api', dependsOn: ['db'] },
      { serviceId: 'web', dependsOn: ['api'] },
      { serviceId: 'worker', dependsOn: ['db'] },
    ]);
    expect(plan.waves.length).toBe(3);
    expect(plan.waves[0].serviceIds).toEqual(['db']);
    expect(plan.waves[1].serviceIds.sort()).toEqual(['api', 'worker']);
    expect(plan.waves[2].serviceIds).toEqual(['web']);
    expect(plan.cyclic).toEqual([]);
  });

  it('detects dependency cycles', () => {
    const plan = WavePlanner.plan([
      { serviceId: 'a', dependsOn: ['b'] },
      { serviceId: 'b', dependsOn: ['a'] },
      { serviceId: 'c', dependsOn: [] },
    ]);
    expect(plan.cyclic.sort()).toEqual(['a', 'b']);
    expect(plan.waves.length).toBe(1);
    expect(plan.waves[0].serviceIds).toEqual(['c']);
  });

  it('critical path sums the longest chain', () => {
    const plan = WavePlanner.plan([
      { serviceId: 'a', dependsOn: [], deployMs: 100 },
      { serviceId: 'b', dependsOn: ['a'], deployMs: 200 },
      { serviceId: 'c', dependsOn: ['b'], deployMs: 50 },
      { serviceId: 'd', dependsOn: [], deployMs: 1000 }, // parallel, not on path
    ]);
    expect(plan.criticalPathMs).toBe(1000); // 'd' alone > a+b+c=350
    const p2 = WavePlanner.plan([
      { serviceId: 'a', dependsOn: [], deployMs: 500 },
      { serviceId: 'b', dependsOn: ['a'], deployMs: 400 },
      { serviceId: 'c', dependsOn: ['a'], deployMs: 100 },
    ]);
    expect(p2.criticalPathMs).toBe(900);
  });

  it('waveOf reports membership or -1 for cyclic', () => {
    const plan = WavePlanner.plan([
      { serviceId: 'x', dependsOn: [] },
      { serviceId: 'y', dependsOn: ['x'] },
    ]);
    expect(WavePlanner.waveOf(plan, 'y')).toBe(1);
    expect(WavePlanner.waveOf(plan, 'ghost')).toBe(-1);
  });
});

// -------------------------------------------------------------- VersionRegistry

describe('VersionRegistry', () => {
  it('tracks current version and soak time', () => {
    const clk = fakeClock();
    const r = new VersionRegistry(clk.now);
    r.deployStarted('v1', EnvColor.BLUE);
    r.finish('v1', 'completed');
    clk.advance(5000);
    r.deployStarted('v2', EnvColor.GREEN);
    r.finish('v2', 'completed');
    expect(r.current()?.version).toBe('v2');
    clk.advance(3000);
    expect(r.currentSoakMs()).toBe(3000);
  });

  it('lastGood skips bad and current versions', () => {
    const clk = fakeClock();
    const r = new VersionRegistry(clk.now);
    r.deployStarted('v1', EnvColor.BLUE);
    r.finish('v1', 'completed');
    r.deployStarted('v2', EnvColor.GREEN);
    r.finish('v2', 'completed');
    r.markBad('v2');
    r.deployStarted('v3', EnvColor.BLUE);
    r.finish('v3', 'completed');
    // Current v3; last-good must be v1 (v2 is bad).
    expect(r.lastGood()?.version).toBe('v1');
  });

  it('lastGood returns undefined when no safe target exists', () => {
    const r = new VersionRegistry();
    r.deployStarted('v1', EnvColor.BLUE);
    r.finish('v1', 'completed');
    expect(r.lastGood()).toBeUndefined();
  });

  it('successRate counts completed vs finished outcomes', () => {
    const r = new VersionRegistry();
    r.deployStarted('a', EnvColor.BLUE);
    r.finish('a', 'completed');
    r.deployStarted('b', EnvColor.GREEN);
    r.finish('b', 'failed');
    r.deployStarted('c', EnvColor.BLUE);
    r.finish('c', 'rolled-back');
    expect(r.successRate()).toBeCloseTo(1 / 3);
  });
});
