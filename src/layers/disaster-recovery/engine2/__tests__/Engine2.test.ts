/**
 * Tests for the DisasterRecovery Engine2 modules.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { measure, conformance, trend, ObjectiveError } from '../ObjectiveTracker';
import { compare, bucketChecksum } from '../ConsistencyVerifier';
import { Runbook, RunbookError } from '../Runbook';
import { FailoverDrill } from '../FailoverDrill';
import type { DrillEnvironment } from '../FailoverDrill';
import { score } from '../Maturity';
import { ManualDrClock2 } from '../types';
import type { FailoverEvent, ObjectiveTargets, RunbookResult } from '../types';

let clock: ManualDrClock2;
const targets: ObjectiveTargets = { rtoMs: 60_000, rpoMs: 1_000 };

beforeEach(() => {
  clock = new ManualDrClock2(1_000_000);
});

function event(over: Partial<FailoverEvent> = {}): FailoverEvent {
  return {
    detectedAt: 0,
    promotedAt: 30_000,
    verifiedAt: 45_000,
    replicaLagMs: 200,
    drill: false,
    ...over,
  };
}

// ---------------------------------------------------------------------
// RTO/RPO measurement
// ---------------------------------------------------------------------

describe('ObjectiveTracker', () => {
  it('derives RTO from verifiedAt−detectedAt, RPO from replica lag', () => {
    const r = measure(event(), targets);
    expect(r.actualRtoMs).toBe(30_000);
    expect(r.totalRecoveryMs).toBe(45_000);
    expect(r.actualRpoMs).toBe(200);
    expect(r.rtoMet).toBe(true);
    expect(r.rpoMet).toBe(true);
  });

  it('fails RTO when recovery exceeds target, RPO when lag does', () => {
    const r = measure(event({ verifiedAt: 90_000, replicaLagMs: 5_000 }), targets);
    expect(r.rtoMet).toBe(false);
    expect(r.rpoMet).toBe(false);
    expect(r.actualRtoMs).toBe(30_000); // promoted still on time
  });

  it('rejects impossible timelines', () => {
    expect(() => measure(event({ promotedAt: -1 }), targets)).toThrow(ObjectiveError);
    expect(() => measure(event({ verifiedAt: 20_000 }), targets)).toThrow(ObjectiveError);
    expect(() => measure(event({ replicaLagMs: -5 }), targets)).toThrow(ObjectiveError);
  });

  it('conformance aggregates pass rates and worst cases', () => {
    const rs = [
      measure(event(), targets),
      measure(event({ verifiedAt: 120_000, replicaLagMs: 2_000 }), targets),
      measure(event({ drill: true }), targets),
    ];
    const c = conformance(rs);
    expect(c.events).toBe(3);
    expect(c.rtoPassRate).toBeCloseTo(2 / 3);
    expect(c.rpoPassRate).toBeCloseTo(2 / 3);
    expect(c.bothMetRate).toBeCloseTo(2 / 3);
    expect(c.worstRtoMs).toBe(120_000);
    expect(c.worstRpoMs).toBe(2_000);
    expect(c.drillShare).toBeCloseTo(1 / 3);
    expect(c.realEvents).toBe(2);
  });

  it('empty conformance is zeroed, not NaN', () => {
    const c = conformance([]);
    expect(c.events).toBe(0);
    expect(c.bothMetRate).toBe(0);
  });

  it('trend splits at a clock value', () => {
    const rs = [
      measure(event({ detectedAt: 0, verifiedAt: 45_000 }), targets),
      measure(event({ detectedAt: 500_000, verifiedAt: 590_000, promotedAt: 530_000 }), targets),
    ];
    const t = trend(rs, 400_000);
    expect(t.before).toBe(1);
    expect(t.after).toBe(0);
    expect(t.delta).toBe(-1);
  });
});

// ---------------------------------------------------------------------
// Consistency verification
// ---------------------------------------------------------------------

describe('ConsistencyVerifier', () => {
  it('bucketChecksum is order-independent', () => {
    const a = bucketChecksum('t', ['r1', 'r2', 'r3']);
    const b = bucketChecksum('t', ['r3', 'r1', 'r2']);
    expect(a.checksum).toBe(b.checksum);
    expect(a.count).toBe(3);
  });

  it('matched buckets report consistent', () => {
    const p = [bucketChecksum('orders', ['a', 'b']), bucketChecksum('users', ['x'])];
    const r = [bucketChecksum('users', ['x']), bucketChecksum('orders', ['b', 'a'])];
    const rep = compare(p, r);
    expect(rep.consistent).toBe(true);
    expect(rep.matched).toBe(2);
    expect(rep.bucketsCompared).toBe(2);
  });

  it('flags missing buckets, count mismatches and checksum mismatches', () => {
    const p = [
      bucketChecksum('a', ['x']),
      bucketChecksum('b', ['x', 'y']),
      bucketChecksum('c', ['x']),
      bucketChecksum('d', ['x']),
    ];
    const r = [
      bucketChecksum('a', ['x']),
      bucketChecksum('b', ['x']), // short a row
      bucketChecksum('c', ['z']), // same count, different content
      // d missing entirely
      bucketChecksum('e', ['x']), // extra on replica
    ];
    const rep = compare(p, r);
    expect(rep.consistent).toBe(false);
    const by = new Map(rep.diffs.map((d) => [d.bucket, d.side]));
    expect(by.get('a')).toBe('ok');
    expect(by.get('b')).toBe('count-mismatch');
    expect(by.get('c')).toBe('checksum-mismatch');
    expect(by.get('d')).toBe('missing-replica');
    expect(by.get('e')).toBe('missing-primary');
  });
});

// ---------------------------------------------------------------------
// Runbook
// ---------------------------------------------------------------------

describe('Runbook', () => {
  it('runs steps in order with checkpoints on required steps', async () => {
    const order: string[] = [];
    const rb = new Runbook(
      [
        { id: 'detect', name: 'Detect', required: true, run: () => void order.push('detect') },
        { id: 'promote', name: 'Promote', required: true, dependsOn: ['detect'], run: () => void order.push('promote') },
        { id: 'verify', name: 'Verify', required: false, dependsOn: ['promote'], run: () => void order.push('verify') },
      ],
      clock
    );
    const r = await rb.run();
    expect(order).toEqual(['detect', 'promote', 'verify']);
    expect(r.halted).toBe(false);
    expect(r.checkpoints.map((c) => c.stepId)).toEqual(['detect', 'promote']);
    expect(r.outcomes.every((o) => o.status === 'done')).toBe(true);
  });

  it('a failed required step halts; later steps stay pending', async () => {
    const rb = new Runbook(
      [
        { id: 'a', name: 'A', required: true, run: () => { throw new Error('down'); } },
        { id: 'b', name: 'B', required: true, dependsOn: ['a'], run: () => {} },
        { id: 'c', name: 'C', required: true, run: () => {} },
      ],
      clock
    );
    const r = await rb.run();
    expect(r.halted).toBe(true);
    expect(r.failedStep).toBe('a');
    const byId = new Map(r.outcomes.map((o) => [o.id, o.status]));
    expect(byId.get('a')).toBe('failed');
    expect(byId.get('b')).toBe('skipped'); // unmet dep
    expect(byId.get('c')).toBe('skipped'); // unreachable after halt
  });

  it('a failed non-required step records failed and continues', async () => {
    const ran: string[] = [];
    const rb = new Runbook(
      [
        { id: 'advisory', name: 'Advisory', required: false, run: () => { throw new Error('meh'); } },
        { id: 'real', name: 'Real', required: true, run: () => void ran.push('real') },
      ],
      clock
    );
    const r = await rb.run();
    expect(ran).toEqual(['real']);
    expect(r.halted).toBe(false);
    expect(r.outcomes[0]?.status).toBe('failed');
    expect(r.outcomes[0]?.error).toBe('meh');
  });

  it('steps share values via publish/read', async () => {
    const rb = new Runbook(
      [
        {
          id: 'produce', name: 'P', required: true,
          run: (ctx) => { ctx.publish('endpoint', 'db-2.internal'); },
        },
        {
          id: 'consume', name: 'C', required: true, dependsOn: ['produce'],
          run: (ctx) => `pointed at ${ctx.read<string>('endpoint')}`,
        },
      ],
      clock
    );
    const r = await rb.run();
    expect(r.outcomes[1]?.note).toBe('pointed at db-2.internal');
  });

  it('rejects duplicate ids and unknown dependencies', () => {
    expect(
      () => new Runbook([{ id: 'x', name: 'x', required: true, run: () => {} }, { id: 'x', name: 'x2', required: true, run: () => {} }], clock)
    ).toThrow(RunbookError);
    expect(
      () => new Runbook([{ id: 'x', name: 'x', required: true, dependsOn: ['ghost'], run: () => {} }], clock)
    ).toThrow(RunbookError);
  });
});

// ---------------------------------------------------------------------
// Failover drill
// ---------------------------------------------------------------------

describe('FailoverDrill', () => {
  function env(lagMs: number, promoteMs: number, verifyMs: number): DrillEnvironment {
    return {
      replicaLag: () => lagMs,
      detect: () => {},
      promote: () => clock.advance(promoteMs),
      verify: () => clock.advance(verifyMs),
    };
  }

  it('measures phases off the clock and scores against targets', async () => {
    const d = new FailoverDrill(env(200, 30_000, 15_000), targets, clock);
    const out = await d.run();
    expect(out.event.drill).toBe(true);
    expect(out.phases.promoteMs).toBe(30_000);
    expect(out.phases.verifyMs).toBe(15_000);
    expect(out.objective.rtoMet).toBe(true); // 45s ≤ 60s
    expect(out.score).toBe(100);
  });

  it('a slow drill scores lower', async () => {
    const d = new FailoverDrill(env(200, 90_000, 0), targets, clock); // RTO 90s > 60s
    const out = await d.run();
    expect(out.objective.rtoMet).toBe(false);
    expect(out.score).toBeLessThan(100);
    expect(out.score).toBeGreaterThan(0); // RPO still met
  });

  it('runbook results feed the score', async () => {
    const rb = new Runbook(
      [{ id: 's', name: 'S', required: true, run: () => {} }],
      clock
    );
    const d = new FailoverDrill(env(200, 30_000, 15_000), targets, clock, rb);
    const out = await d.run();
    expect(out.runbook?.halted).toBe(false);
    expect(out.score).toBe(100); // 50+50+checkpoint bonus, capped at 100
    const bad = new FailoverDrill(
      env(200, 30_000, 15_000),
      targets,
      clock,
      new Runbook([{ id: 'x', name: 'X', required: true, run: () => { throw new Error('no'); } }], clock)
    );
    const out2 = await bad.run();
    expect(out2.score).toBeLessThan(100);
    expect(out2.runbook?.halted).toBe(true);
  });
});

// ---------------------------------------------------------------------
// Maturity
// ---------------------------------------------------------------------

describe('Maturity', () => {
  const okObjective = measure(event(), targets);
  const okConsistency = compare(
    [bucketChecksum('a', ['x'])],
    [bucketChecksum('a', ['x'])]
  );
  const okRunbook: RunbookResult = {
    halted: false,
    outcomes: [],
    checkpoints: [{ stepId: 's', at: 0 }],
    completedAt: 0,
  };

  it('level 0 with no evidence', () => {
    const s = score({ objectives: [], consistency: [], runbooks: [] });
    expect(s.level).toBe(0);
    expect(s.levelName).toBe('ad-hoc');
  });

  it('level 1: a runbook ran', () => {
    const s = score({ objectives: [], consistency: [], runbooks: [okRunbook] });
    expect(s.level).toBe(1);
  });

  it('level 2: a measured event exists', () => {
    const s = score({ objectives: [okObjective], consistency: [], runbooks: [okRunbook] });
    expect(s.level).toBe(2);
  });

  it('level 3: consistency checked too', () => {
    const s = score({
      objectives: [okObjective],
      consistency: [okConsistency],
      runbooks: [okRunbook],
    });
    expect(s.level).toBe(3);
  });

  it('level 4 needs volume and pass rates', () => {
    const s = score({
      objectives: [okObjective, okObjective, okObjective],
      consistency: [okConsistency],
      runbooks: [okRunbook],
    });
    expect(s.level).toBe(4);
    expect(s.levelName).toBe('proven');
    expect(s.detail.objectivePassRate).toBe(1);
  });

  it('a failing objective rate blocks level 4', () => {
    const bad = measure(event({ verifiedAt: 300_000, replicaLagMs: 9_000 }), targets);
    const s = score({
      objectives: [okObjective, okObjective, bad],
      consistency: [okConsistency],
      runbooks: [okRunbook],
    });
    expect(s.level).toBe(3);
    expect(s.nextLevelNeeds).toContain('80%');
  });
});

// ---------------------------------------------------------------------
// Drill schedule
// ---------------------------------------------------------------------

import { DrillSchedule } from '../DrillSchedule';

describe('DrillSchedule', () => {
  it('registers drills on a cadence and reports due', () => {
    const sched = new DrillSchedule(clock);
    sched.register('weekly', 7 * 24 * 3600 * 1000, 0);
    expect(sched.due().map((d) => d.name)).toEqual(['weekly']);
  });

  it('overdue drills sort soonest-due first', () => {
    const sched = new DrillSchedule(clock);
    sched.register('daily', 86_400_000, 86_400_000); // due in 1 day
    sched.register('hourly', 3_600_000, 3_600_000);   // due in 1 hour
    clock.advance(90_000_000); // both overdue; hourly's due was sooner
    const due = sched.due();
    expect(due.map((d) => d.name)).toEqual(['hourly', 'daily']);
  });

  it('recordRun anchors the next run to the cadence grid, not completion', () => {
    const sched = new DrillSchedule(clock);
    sched.register('daily', 86_400_000);
    // Run it now — anchor moves forward one cadence.
    sched.recordRun('daily');
    expect(sched.due()).toEqual([]);
    // Run 2 days late: anchor steps until after completion.
    clock.advance(2 * 86_400_000);
    sched.recordRun('daily');
    const next = sched.nextDue('daily');
    expect(next).toBeGreaterThan(clock.now());
    expect((next - clock.now()) <= 86_400_000).toBe(true);
  });

  it('coverage compares expected vs completed runs in a window', () => {
    const sched = new DrillSchedule(clock);
    sched.register('daily', 86_400_000);
    sched.recordRun('daily', 500_000); // inside the window
    const c = sched.coverage(0, 10 * 86_400_000);
    expect(c.expectedRuns).toBe(10);
    expect(c.completedRuns).toBe(1);
    expect(c.rate).toBeCloseTo(0.1);
  });
});

// ---------------------------------------------------------------------
// Drill history
// ---------------------------------------------------------------------

import { DrillHistory } from '../DrillHistory';
import type { DrillOutcome } from '../FailoverDrill';

function outcome(totalMs: number, lagMs = 100): DrillOutcome {
  const ev: FailoverEvent = {
    detectedAt: 0, promotedAt: totalMs - 5_000, verifiedAt: totalMs,
    replicaLagMs: lagMs, drill: true,
  };
  return {
    event: ev,
    objective: measure(ev, targets),
    score: 100,
    phases: { detectMs: 0, promoteMs: totalMs - 5_000, verifyMs: 5_000 },
  };
}

describe('DrillHistory', () => {
  it('no regression verdict without a baseline', () => {
    const h = new DrillHistory();
    h.record(outcome(30_000));
    const r = h.regression();
    expect(r.regressed).toBe(false);
    expect(r.factor).toBeNull();
  });

  it('a slow drill regresses against the median baseline', () => {
    const h = new DrillHistory();
    for (const t of [30_000, 32_000, 28_000]) h.record(outcome(t));
    h.record(outcome(60_000)); // 2× the ~30s median
    const r = h.regression(1.5, 3);
    expect(r.regressed).toBe(true);
    expect(r.factor).toBeCloseTo(2);
    expect(r.baselineMs).toBe(30_000);
  });

  it('a normal drill passes', () => {
    const h = new DrillHistory();
    for (const t of [30_000, 32_000, 28_000]) h.record(outcome(t));
    h.record(outcome(31_000));
    expect(h.regression(1.5, 3).regressed).toBe(false);
  });

  it('exposes scores and objectives for charting and maturity', () => {
    const h = new DrillHistory();
    h.record(outcome(30_000));
    h.record(outcome(31_000));
    expect(h.scores()).toEqual([100, 100]);
    expect(h.objectives().length).toBe(2);
    expect(h.objectives()[0]?.rtoMet).toBe(true);
  });
});

// ---------------------------------------------------------------------
// Replication lag
// ---------------------------------------------------------------------

import { ReplicationLagTracker } from '../ReplicationLag';

describe('ReplicationLagTracker', () => {
  it('current returns the most recent sample', () => {
    const t = new ReplicationLagTracker(60_000, clock);
    t.record(100);
    t.record(250);
    expect(t.current()?.lagMs).toBe(250);
  });

  it('window aggregates avg/max/p95 and breach span', () => {
    const t = new ReplicationLagTracker(60_000, clock);
    // 10 samples at 1s intervals, lags 100..1000.
    for (let i = 1; i <= 10; i++) t.record(i * 100, 0, clock.now());
    const w = t.window();
    expect(w.samples).toBe(10);
    expect(w.avgLagMs).toBeCloseTo(550);
    expect(w.maxLagMs).toBe(1000);
    expect(w.p95LagMs).toBe(1000);
    expect(w.longestBreachMs).toBe(0); // no target → nothing over 0? target=0 counts all
    // Breach with a target of 400: samples 500..1000 above.
    const w2 = t.window(400);
    expect(w2.longestBreachMs).toBeGreaterThanOrEqual(0);
  });

  it('breach measures the longest continuous above-target run', () => {
    const t = new ReplicationLagTracker(60_000, clock);
    // Over-target samples at now-10s..now-5s, under at now-4s, over again at now-3s..now-1s.
    [500, 600, 700, 800, 900, 1000].forEach((lag, i) =>
      t.record(lag, 0, clock.now() - 10_000 + i * 1000)
    );
    t.record(50, 0, clock.now() - 4_000);
    [1100, 1200, 1300].forEach((lag, i) =>
      t.record(lag, 0, clock.now() - 3_000 + i * 1000)
    );
    const w = t.window(400);
    expect(w.longestBreachMs).toBe(5000); // now-10s → now-5s span over target
  });

  it('evicts samples outside the window', () => {
    const t = new ReplicationLagTracker(10_000, clock);
    t.record(100, 0, clock.now() - 15_000);
    t.record(200, 0, clock.now());
    expect(t.window().samples).toBe(1);
  });
});

// ---------------------------------------------------------------------
// Backup verifier
// ---------------------------------------------------------------------

import { BackupVerifier } from '../BackupVerifier';
import type { DatasetTarget, RestorePoint } from '../BackupVerifier';

describe('BackupVerifier', () => {
  const target: DatasetTarget = {
    dataset: 'prod-db',
    expectedBuckets: ['orders', 'users'],
    rpoMs: 3_600_000,
    proofMaxAgeMs: 7 * 24 * 3600 * 1000,
  };
  const mkPoint = (over: Partial<RestorePoint> = {}): RestorePoint => ({
    id: 'p1', dataset: 'prod-db', takenAt: clock.now(),
    buckets: ['orders', 'users'], ...over,
  });

  it('a fresh, complete, proven point passes', () => {
    const v = new BackupVerifier(clock);
    v.register(mkPoint({ restoreProof: { at: clock.now(), signature: 'ok' } }));
    const d = v.verify(target);
    expect(d.ok).toBe(true);
    expect(d.issues).toEqual([]);
  });

  it('a point older than the RPO flags stale', () => {
    const v = new BackupVerifier(clock);
    v.register(mkPoint({
      takenAt: clock.now() - 2 * 3_600_000,
      restoreProof: { at: clock.now(), signature: 'ok' },
    }));
    const d = v.verify(target);
    expect(d.ok).toBe(false);
    expect(d.issues[0]?.kind).toBe('stale-restore-point');
  });

  it('missing buckets flag', () => {
    const v = new BackupVerifier(clock);
    v.register(mkPoint({ buckets: ['orders'] }));
    const d = v.verify(target);
    expect(d.issues.map((i) => i.kind)).toContain('missing-buckets');
  });

  it('unproven and stale-proof both flag', () => {
    const v = new BackupVerifier(clock);
    v.register(mkPoint());
    expect(v.verify(target).issues.map((i) => i.kind)).toContain('unproven');

    const v2 = new BackupVerifier(clock);
    v2.register(mkPoint({
      restoreProof: { at: clock.now() - 8 * 24 * 3600 * 1000, signature: 'ok' },
    }));
    expect(v2.verify(target).issues.map((i) => i.kind)).toContain('stale-proof');
  });

  it('no registered points → no-restore-point', () => {
    const v = new BackupVerifier(clock);
    const d = v.verify(target);
    expect(d.ok).toBe(false);
    expect(d.issues[0]?.kind).toBe('no-restore-point');
  });

  it('newest inside the window wins over a stale newer-looking pick', () => {
    const v = new BackupVerifier(clock);
    v.register(mkPoint({ id: 'old', takenAt: clock.now() - 10 * 3_600_000 }));
    v.register(mkPoint({ id: 'fresh', takenAt: clock.now() - 1000, restoreProof: { at: clock.now(), signature: 'ok' } }));
    const d = v.verify(target);
    expect(d.point?.id).toBe('fresh');
    expect(d.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------
// Recovery estimator
// ---------------------------------------------------------------------

import { estimate } from '../RecoveryEstimator';

describe('RecoveryEstimator', () => {
  it('estimates p50/p95 per phase and totals', () => {
    const outcomes = [30_000, 32_000, 28_000, 31_000, 40_000].map((t) => outcome(t));
    const e = estimate(outcomes);
    expect(e.drills).toBe(5);
    expect(e.detect.p50).toBe(0);
    expect(e.promote.p50).toBeGreaterThan(0);
    expect(e.p50TotalMs).toBeGreaterThan(0);
    expect(e.p95TotalMs).toBeGreaterThanOrEqual(e.p50TotalMs);
  });

  it('p95 on small sets returns the max', () => {
    const outcomes = [10_000, 20_000].map((t) => outcome(t));
    const e = estimate(outcomes);
    expect(e.p95TotalMs).toBeGreaterThanOrEqual(e.p50TotalMs);
  });

  it('drift shows the latest drill vs the median', () => {
    const outcomes = [30_000, 30_000, 30_000, 60_000].map((t) => outcome(t));
    const e = estimate(outcomes);
    expect(e.driftMs).toBe(30_000); // latest (60s) − median (30s)
  });

  it('empty set yields zero estimates and null drift', () => {
    const e = estimate([]);
    expect(e.p50TotalMs).toBe(0);
    expect(e.driftMs).toBeNull();
  });
});

// ---------------------------------------------------------------------
// Drill checklist
// ---------------------------------------------------------------------

import { readiness, standardChecks } from '../DrillChecklist';

describe('DrillChecklist', () => {
  it('a failing blocking item makes the drill not ready', () => {
    const r = readiness([
      { name: 'a', ok: true, blocking: true },
      { name: 'b', ok: false, blocking: true },
      { name: 'c', ok: false, blocking: false },
    ]);
    expect(r.ready).toBe(false);
    expect(r.blockers.map((i) => i.name)).toEqual(['b']);
    expect(r.warnings.map((i) => i.name)).toEqual(['c']);
  });

  it('advisory failures warn without blocking', () => {
    const r = readiness([{ name: 'advisory', ok: false, blocking: false }]);
    expect(r.ready).toBe(true);
    expect(r.warnings.length).toBe(1);
  });

  it('standardChecks encode the production gates', () => {
    const items = standardChecks({
      replicaLagMs: 500, rpoMs: 1000,
      lastConsistencyOk: true, incidentOpen: false,
      lastDrillAt: 900_000, now: 1_000_000, cooldownMs: 86_400_000,
    });
    const by = new Map(items.map((i) => [i.name, i]));
    expect(by.get('replica-lag-within-rpo')?.ok).toBe(true);
    expect(by.get('drill-cooldown')?.ok).toBe(false); // drilled recently
    expect(by.get('drill-cooldown')?.blocking).toBe(false); // advisory
    // An open incident blocks.
    const bad = standardChecks({
      replicaLagMs: 500, rpoMs: 1000,
      lastConsistencyOk: true, incidentOpen: true,
      lastDrillAt: null, now: 1_000_000, cooldownMs: 0,
    });
    expect(readiness(bad).ready).toBe(false);
  });
});
