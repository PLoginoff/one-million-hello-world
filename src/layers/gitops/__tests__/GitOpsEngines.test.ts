import { describe, it, expect, beforeEach } from 'bun:test';
import { DesiredStateStore } from '../engines/DesiredStateStore';
import { DriftDetectionEngine } from '../engines/DriftDetectionEngine';
import { ReconciliationEngine } from '../engines/ReconciliationEngine';
import { InMemoryLiveStore } from '../engines/InMemoryLiveStore';
import { HealthAssessmentEngine } from '../engines/HealthAssessmentEngine';
import { PolicyGateEngine } from '../engines/PolicyGateEngine';
import { GitOpsEngine } from '../engines/GitOpsEngine';
import { DiffAction, HealthStatus, ResourceSpec, TestClock } from '../engines/types';

function res(kind: string, name: string, spec: Record<string, unknown>, dependsOn: string[] = [], wave = 0): ResourceSpec {
  return { kind, name, spec, dependsOn, wave };
}

const commit = { sha: 'abc123', author: 'dev', message: 'update' };

describe('DesiredStateStore', () => {
  it('keeps revision history with head/previous navigation', () => {
    const store = new DesiredStateStore(new TestClock(0));
    const r1 = store.commit(commit, [res('Svc', 'a', { v: 1 })]);
    const r2 = store.commit(commit, [res('Svc', 'a', { v: 2 })]);
    expect(store.head()!.id).toBe(r2.id);
    expect(store.previous(r2.id)!.id).toBe(r1.id);
    expect(store.next(r1.id)!.id).toBe(r2.id);
    expect(store.previous(r1.id)).toBeNull();
  });

  it('deep-copies resources so callers cannot rewrite history', () => {
    const store = new DesiredStateStore(new TestClock(0));
    const spec = { replicas: 3 };
    const r = res('Deploy', 'app', spec);
    const rev = store.commit(commit, [r]);
    spec.replicas = 99;
    r.spec.replicas = 99;
    expect(rev.resources.get('Deploy/app')!.spec.replicas).toBe(3);
  });
});

describe('DriftDetectionEngine', () => {
  let live: InMemoryLiveStore;
  let drift: DriftDetectionEngine;

  beforeEach(() => {
    live = new InMemoryLiveStore();
    drift = new DriftDetectionEngine(live);
  });

  it('reports in-sync when live matches desired', () => {
    const store = new DesiredStateStore(new TestClock(0));
    const rev = store.commit(commit, [res('Svc', 'a', { port: 80 })]);
    live.seed(res('Svc', 'a', { port: 80 }));
    const report = drift.detect(rev);
    expect(report.inSync).toBe(true);
    expect(report.diffs.length).toBe(0);
  });

  it('detects creates, updates, deletes', () => {
    const store = new DesiredStateStore(new TestClock(0));
    const rev = store.commit(commit, [
      res('Svc', 'new', { p: 1 }),
      res('Svc', 'changed', { p: 2 }),
    ]);
    live.seed(res('Svc', 'changed', { p: 1 }));
    live.seed(res('Svc', 'stale', { p: 9 }));
    const report = drift.detect(rev);
    expect(report.creates).toBe(1);
    expect(report.updates).toBe(1);
    expect(report.deletes).toBe(1);
  });

  it('produces field-level diffs with dot paths', () => {
    const store = new DesiredStateStore(new TestClock(0));
    const rev = store.commit(commit, [res('Deploy', 'app', { replicas: 3, env: { A: 'x', B: 'y' } })]);
    live.seed(res('Deploy', 'app', { replicas: 2, env: { A: 'x', B: 'z' } }));
    const report = drift.detect(rev);
    const update = report.diffs.find((d) => d.action === DiffAction.Update)!;
    const paths = update.fieldDiffs.map((f) => f.path).sort();
    expect(paths).toEqual(['spec.env.B', 'spec.replicas']);
  });
});

describe('ReconciliationEngine', () => {
  let live: InMemoryLiveStore;
  let store: DesiredStateStore;
  let drift: DriftDetectionEngine;
  let reconciler: ReconciliationEngine;

  beforeEach(() => {
    live = new InMemoryLiveStore();
    store = new DesiredStateStore(new TestClock(0));
    drift = new DriftDetectionEngine(live);
    reconciler = new ReconciliationEngine(live);
  });

  it('applies diffs and converges live to desired', () => {
    const rev = store.commit(commit, [res('Svc', 'a', { v: 1 }), res('Svc', 'b', { v: 2 })]);
    const result = reconciler.reconcile(rev, drift.detect(rev));
    expect(result.success).toBe(true);
    expect(live.keys().sort()).toEqual(['Svc/a', 'Svc/b']);
  });

  it('applies dependencies before dependents', () => {
    const order: string[] = [];
    const hook = (d: { key: string }) => { order.push(d.key); };
    const r2 = new ReconciliationEngine(live, hook);
    // child depends on parent; declare child first to prove ordering
    const rev = store.commit(commit, [
      res('Svc', 'child', { v: 1 }, ['Svc/parent']),
      res('Svc', 'parent', { v: 1 }),
    ]);
    r2.reconcile(rev, drift.detect(rev));
    expect(order.indexOf('Svc/parent')).toBeLessThan(order.indexOf('Svc/child'));
  });

  it('honors sync waves — lower wave applies first', () => {
    const order: string[] = [];
    const r2 = new ReconciliationEngine(live, (d) => { order.push(d.key); });
    const rev = store.commit(commit, [
      res('Svc', 'late', { v: 1 }, [], 5),
      res('Svc', 'early', { v: 1 }, [], 1),
    ]);
    r2.reconcile(rev, drift.detect(rev));
    expect(order).toEqual(['Svc/early', 'Svc/late']);
  });

  it('skips dependents of a failed step but applies independents', () => {
    const r2 = new ReconciliationEngine(live, (d) => {
      if (d.key === 'Svc/parent') throw new Error('apply failed');
    });
    const rev = store.commit(commit, [
      res('Svc', 'parent', { v: 1 }),
      res('Svc', 'child', { v: 1 }, ['Svc/parent']),
      res('Svc', 'independent', { v: 1 }),
    ]);
    const result = r2.reconcile(rev, drift.detect(rev));
    const byKey = new Map(result.steps.map((s) => [s.diff.key, s.status]));
    expect(byKey.get('Svc/parent')).toBe('failed');
    expect(byKey.get('Svc/child')).toBe('skipped');
    expect(byKey.get('Svc/independent')).toBe('applied');
    expect(result.success).toBe(false);
  });

  it('deletes children before parents', () => {
    const order: string[] = [];
    const r2 = new ReconciliationEngine(live, (d) => { order.push(`${d.action}:${d.key}`); });
    // Both exist live; desired removes both. child dependsOn parent in live spec.
    live.seed(res('Svc', 'parent', { v: 1 }));
    live.seed(res('Svc', 'child', { v: 1 }, ['Svc/parent']));
    const rev = store.commit(commit, []);
    r2.reconcile(rev, drift.detect(rev));
    const ci = order.indexOf('delete:Svc/child');
    const pi = order.indexOf('delete:Svc/parent');
    expect(ci).toBeLessThan(pi);
  });
});

describe('HealthAssessmentEngine', () => {
  it('probes by kind and falls back to wildcard', async () => {
    const live = new InMemoryLiveStore();
    live.seed(res('Deploy', 'app', { ready: true }));
    live.seed(res('Svc', 'net', {}));
    const h = new HealthAssessmentEngine(live);
    h.registerProbe('Deploy', (r) => (r.spec.ready ? HealthStatus.Healthy : HealthStatus.Unhealthy));
    h.registerProbe('*', () => HealthStatus.Healthy);
    const reports = await h.assessAll(['Deploy/app', 'Svc/net']);
    expect(reports[0]!.status).toBe(HealthStatus.Healthy);
    expect(reports[1]!.status).toBe(HealthStatus.Healthy);
  });

  it('reports unknown for missing resource and unhealthy for crashing probe', async () => {
    const live = new InMemoryLiveStore();
    live.seed(res('Deploy', 'app', {}));
    const h = new HealthAssessmentEngine(live);
    h.registerProbe('Deploy', () => { throw new Error('probe boom'); });
    expect((await h.assess('missing/x')).status).toBe(HealthStatus.Unknown);
    expect((await h.assess('Deploy/app')).status).toBe(HealthStatus.Unhealthy);
  });
});

describe('PolicyGateEngine', () => {
  it('denies resources violating rules', () => {
    const gates = new PolicyGateEngine();
    gates.addRule({
      id: 'no-latest',
      description: 'no :latest images',
      rule: (r) => (typeof r.spec.image === 'string' && r.spec.image.endsWith(':latest') ? 'latest tag forbidden' : null),
    });
    const store = new DesiredStateStore(new TestClock(0));
    const bad = store.commit(commit, [res('Deploy', 'app', { image: 'nginx:latest' })]);
    const good = store.commit(commit, [res('Deploy', 'app', { image: 'nginx:1.27' })]);
    expect(gates.evaluate(bad).allowed).toBe(false);
    expect(gates.evaluate(bad).violations[0]!.ruleId).toBe('no-latest');
    expect(gates.evaluate(good).allowed).toBe(true);
  });

  it('a crashing rule fails closed', () => {
    const gates = new PolicyGateEngine();
    gates.addRule({ id: 'boom', description: 'd', rule: () => { throw new Error('x'); } });
    const store = new DesiredStateStore(new TestClock(0));
    const rev = store.commit(commit, [res('Svc', 'a', {})]);
    expect(gates.evaluate(rev).allowed).toBe(false);
  });
});

describe('GitOpsEngine (end-to-end)', () => {
  it('full loop: gate → drift → reconcile → health → promote', async () => {
    const eng = new GitOpsEngine(new TestClock(0));
    eng.gates.addRule({ id: 'r1', description: 'd', rule: () => null });
    eng.health.registerProbe('*', () => HealthStatus.Healthy);
    const rev = eng.store.commit(commit, [res('Svc', 'a', { v: 1 })]);
    const result = await eng.sync(rev.id);
    expect(result.promoted).toBe(true);
    expect(eng.lastKnownGood()).toBe(rev.id);
    expect(eng.live.keys()).toContain('Svc/a');
  });

  it('gate denial short-circuits before apply', async () => {
    const eng = new GitOpsEngine(new TestClock(0));
    eng.gates.addRule({ id: 'deny-all', description: 'd', rule: () => 'nope' });
    const rev = eng.store.commit(commit, [res('Svc', 'a', { v: 1 })]);
    const result = await eng.sync(rev.id);
    expect(result.promoted).toBe(false);
    expect(result.drift).toBeNull();
    expect(eng.live.keys()).toEqual([]);
  });

  it('rollback restores last-known-good', async () => {
    const eng = new GitOpsEngine(new TestClock(0));
    eng.health.registerProbe('*', () => HealthStatus.Healthy);
    const good = eng.store.commit(commit, [res('Svc', 'a', { v: 1 })]);
    await eng.sync(good.id);
    // Commit a bad rev that fails health
    eng.health.registerProbe('Svc', () => HealthStatus.Unhealthy);
    const bad = eng.store.commit(commit, [res('Svc', 'a', { v: 2 })]);
    const badResult = await eng.sync(bad.id);
    expect(badResult.promoted).toBe(false);
    // Roll back to last-known-good
    eng.health.registerProbe('Svc', () => HealthStatus.Healthy);
    const rb = await eng.rollback();
    expect(rb.revisionId).toBe(good.id);
    expect((eng.live.get('Svc/a'))!.spec.v).toBe(1);
  });

  it('throws rollback with no known-good', async () => {
    const eng = new GitOpsEngine(new TestClock(0));
    await expect(eng.rollback()).rejects.toThrow();
  });
});
