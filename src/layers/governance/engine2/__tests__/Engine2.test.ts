/**
 * Tests for governance engine2: RetentionExecutor (actual deletion +
 * legal holds), ReviewCampaignManager (reminders + SoD), PolicyScanner
 * (config violations), ReportScheduler (cron-style recurring reports).
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  DAY_MS,
  ManagedResource,
  PolicyScanner,
  ReportScheduler,
  RetentionExecutor,
  ReviewCampaignManager,
  TestClock,
} from '..';

describe('RetentionExecutor', () => {
  let clock: TestClock;
  let deleted: string[];
  let exec: RetentionExecutor;

  const mkRes = (id: string, category: string, createdAt: number): ManagedResource => ({
    id,
    category,
    createdAt,
  });

  beforeEach(() => {
    clock = new TestClock(10 * DAY_MS);
    deleted = [];
    exec = new RetentionExecutor((r) => {
      deleted.push(r.id);
    }, clock);
    exec.addRule({ category: 'logs', retainMs: 30 * DAY_MS });
    exec.addRule({ category: 'temp', retainMs: 1 * DAY_MS });
  });

  it('deletes expired resources and retains fresh ones', async () => {
    exec.register(mkRes('old-log', 'logs', 0)); // 10 days old, under 30d -> retained
    exec.register(mkRes('stale-temp', 'temp', 0)); // 10d > 1d -> deleted
    exec.register(mkRes('fresh-temp', 'temp', clock.now() - 100)); // fresh

    const plan = await exec.run();
    const byId = new Map(plan.map((d) => [d.resourceId, d.action]));
    expect(byId.get('old-log')).toBe('retained');
    expect(byId.get('stale-temp')).toBe('deleted');
    expect(byId.get('fresh-temp')).toBe('retained');
    expect(deleted).toEqual(['stale-temp']);
    expect(exec.resourceCount()).toBe(2);
  });

  it('never deletes resources under legal hold, even when expired', async () => {
    exec.register(mkRes('held', 'temp', 0));
    exec.hold('held', 'litigation-42');
    const plan = await exec.run();
    expect(plan[0]!.action).toBe('legal-hold');
    expect(deleted).toEqual([]);
    // After release, the resource becomes deletable again.
    exec.release('held', 'litigation-42');
    const plan2 = await exec.run();
    expect(plan2[0]!.action).toBe('deleted');
  });

  it('dry-run reports the plan without deleting', async () => {
    exec.register(mkRes('x', 'temp', 0));
    const plan = await exec.run(true);
    expect(plan[0]!.action).toBe('deleted');
    expect(deleted).toEqual([]);
    expect(exec.resourceCount()).toBe(1);
  });

  it('applies the longest rule when categories re-register', () => {
    exec.addRule({ category: 'temp', retainMs: 365 * DAY_MS }); // longer wins
    exec.register(mkRes('x', 'temp', 0));
    return exec.run().then((plan) => {
      expect(plan[0]!.action).toBe('retained'); // 10d < 365d
    });
  });
});

describe('ReviewCampaignManager', () => {
  let clock: TestClock;
  let mgr: ReviewCampaignManager;

  beforeEach(() => {
    clock = new TestClock(0);
    mgr = new ReviewCampaignManager(clock);
  });

  it('runs a campaign: certify/revoke then auto-revoke pending on close', () => {
    const camp = mgr.open('Q4 review', 30 * DAY_MS, DAY_MS);
    const i1 = mgr.addItem(camp.id, 'alice', 'admin', 'bob');
    const i2 = mgr.addItem(camp.id, 'carol', 'read', 'bob');
    const i3 = mgr.addItem(camp.id, 'dave', 'write', 'bob');

    mgr.certify(camp.id, i1.id, 'bob');
    mgr.revoke(camp.id, i2.id, 'bob');
    // i3 stays pending.
    mgr.close(camp.id);

    const s = mgr.summary(camp.id);
    expect(s.certified).toBe(1);
    expect(s.revoked).toBe(2); // explicit + auto-revoked
    expect(s.pending).toBe(0);
    expect(i3.decision).toBe('revoked');
  });

  it('rejects decisions by non-assigned reviewers and self-certification', () => {
    const camp = mgr.open('x', DAY_MS, DAY_MS);
    const i = mgr.addItem(camp.id, 'alice', 'admin', 'bob');
    expect(() => mgr.certify(camp.id, i.id, 'mallory')).toThrow('assigned to bob');
    // SoD: reviewer == subject
    const self = mgr.addItem(camp.id, 'bob', 'admin', 'bob');
    expect(() => mgr.certify(camp.id, self.id, 'bob')).toThrow('own access');
    // Reassign then certify works.
    mgr.reassign(camp.id, self.id, 'carol');
    mgr.certify(camp.id, self.id, 'carol');
    expect(self.decision).toBe('certified');
  });

  it('emits reminders to pending reviewers on the reminder interval', () => {
    const camp = mgr.open('x', 30 * DAY_MS, DAY_MS);
    mgr.addItem(camp.id, 'a', 'g1', 'rev1');
    mgr.addItem(camp.id, 'b', 'g2', 'rev1');
    mgr.addItem(camp.id, 'c', 'g3', 'rev2');

    // First tick inside the interval -> nothing.
    expect(mgr.tick().length).toBe(0);
    clock.advance(DAY_MS + 1);
    const reminders = mgr.tick();
    expect(reminders.length).toBe(2);
    const r1 = reminders.find((r) => r.reviewer === 'rev1')!;
    expect(r1.pendingCount).toBe(2);
    // Second tick too soon -> nothing.
    clock.advance(100);
    expect(mgr.tick().length).toBe(0);
  });
});

describe('PolicyScanner', () => {
  const scanner = new PolicyScanner(new TestClock(0));

  it('flags configs violating equals/missing/present rules', () => {
    const s = new PolicyScanner(new TestClock(0));
    s.addRule({ id: 'r1', name: 'encrypt', kind: 'bucket', field: 'encryption', op: 'equals', value: 'aes256', severity: 'high' });
    s.addRule({ id: 'r2', name: 'has-owner', kind: 'bucket', field: 'owner', op: 'missing', severity: 'medium' });
    s.addRule({ id: 'r3', name: 'no-public', kind: 'bucket', field: 'public', op: 'present', severity: 'critical' });

    const configs = [
      { id: 'b1', kind: 'bucket', attrs: { encryption: 'aes256', owner: 'team-a' } },
      { id: 'b2', kind: 'bucket', attrs: { encryption: 'none', public: true } }, // r1 + r2 + r3
      { id: 'db1', kind: 'db', attrs: {} }, // no db rules
    ];
    const v = s.scan(configs);
    expect(v.length).toBe(3);
    // Critical first.
    expect(v[0]!.severity).toBe('critical');
    expect(v[0]!.configId).toBe('b2');
    expect(s.violatingConfigs(configs)).toEqual(['b2']);
  });

  it('supports numeric and contains ops', () => {
    scanner.addRule({ id: 'n', name: 'n', kind: 'vm', field: 'ports', op: 'gt', value: 10, severity: 'low' });
    scanner.addRule({ id: 'c', name: 'c', kind: 'vm', field: 'tags', op: 'contains', value: 'prod', severity: 'medium' });
    const v = scanner.scan([
      { id: 'vm1', kind: 'vm', attrs: { ports: 22, tags: ['prod', 'web'] } },
      { id: 'vm2', kind: 'vm', attrs: { ports: 5, tags: ['dev'] } },
    ]);
    expect(v.every((x) => x.configId === 'vm2')).toBe(true);
    expect(v.length).toBe(2);
  });
});

describe('ReportScheduler', () => {
  let clock: TestClock;
  let sched: ReportScheduler;

  beforeEach(() => {
    clock = new TestClock(0);
    sched = new ReportScheduler(clock);
  });

  it('runs due jobs once per tick and reschedules from now', async () => {
    let n = 0;
    const job = sched.schedule('daily-soc2', DAY_MS, () => `report-${++n}`);
    clock.advance(DAY_MS + 1);
    const produced = await sched.tick();
    expect(produced.length).toBe(1);
    expect(produced[0]!.payload).toBe('report-1');
    expect(job.lastRunAt).toBe(clock.now());
    expect(job.nextRunAt).toBe(clock.now() + DAY_MS);
  });

  it('coalesces long-overdue jobs into a single catch-up run', async () => {
    let n = 0;
    sched.schedule('j', DAY_MS, () => `r${++n}`);
    clock.advance(10 * DAY_MS); // 10 missed windows
    const produced = await sched.tick();
    expect(produced.length).toBe(1); // not 10
  });

  it('upcoming() lists jobs inside the horizon', () => {
    sched.schedule('a', DAY_MS);
    sched.schedule('b', 30 * DAY_MS);
    expect(sched.upcoming(2 * DAY_MS).length).toBe(1);
    expect(sched.upcoming(31 * DAY_MS).length).toBe(2);
  });

  it('keeps per-job report history and latest()', async () => {
    const job = sched.schedule('j', DAY_MS, () => 'p');
    clock.advance(DAY_MS);
    await sched.tick();
    clock.advance(DAY_MS);
    await sched.tick();
    expect(sched.reports(job.id).length).toBe(2);
    expect(sched.latest(job.id)!.generatedAt).toBe(clock.now());
  });
});
