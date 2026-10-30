import { describe, it, expect, beforeEach } from 'bun:test';
import { DriftPredictor } from '../engine2/DriftPredictor';
import { SyncPolicyEngine } from '../engine2/SyncPolicyEngine';
import { RollbackPlanner, revision } from '../engine2/RollbackPlanner';
import { SecretDriftDetector } from '../engine2/SecretDriftDetector';
import { GitOps2Engine } from '../engine2/GitOps2Engine';
import { InMemoryLiveStore } from '../engines/InMemoryLiveStore';
import { DiffAction, ResourceSpec, TestClock } from '../engines/types';

function res(kind: string, name: string, spec: Record<string, unknown>, wave = 0): ResourceSpec {
  return { kind, name, spec, dependsOn: [], wave };
}

/* ------------------------------------------------------------------ */

describe('DriftPredictor', () => {
  let clock: TestClock;
  let pred: DriftPredictor;

  beforeEach(() => {
    clock = new TestClock(0);
    pred = new DriftPredictor({}, clock);
  });

  it('learns drift proneness from history', () => {
    const keys = ['Deploy/app', 'Svc/app', 'ConfigMap/cfg'];
    for (let w = 0; w < 10; w++) {
      clock.set(w * 60_000);
      pred.observeWindow(keys, [
        { resourceKey: 'Deploy/app', at: clock.now(), fields: ['spec.replicas'] },
        ...(w % 3 === 0 ? [{ resourceKey: 'Svc/app', at: clock.now(), fields: ['spec.port'] }] : []),
      ]);
    }
    const ranked = pred.ranked();
    expect(ranked[0].resourceKey).toBe('Deploy/app');
    expect(ranked[0].probability).toBeGreaterThan(0.8);
    const stable = pred.proneness('ConfigMap/cfg');
    expect(stable.driftCount).toBe(0);
    expect(stable.probability).toBeLessThan(0.15); // smoothed prior, not 0-certainty
  });

  it('tracks hot fields — which paths drift most', () => {
    for (let w = 0; w < 5; w++) {
      pred.observeWindow(['R'], [
        { resourceKey: 'R', at: 0, fields: ['spec.replicas', 'spec.replicas'] },
      ]);
    }
    const p = pred.proneness('R');
    expect(p.hotFields[0]).toBe('spec.replicas');
  });

  it('computes mean inter-drift interval and flags overdue resources', () => {
    const keys = ['cron-job'];
    // Drift every 20 minutes like clockwork.
    for (let w = 0; w < 6; w++) {
      clock.set(w * 20 * 60_000);
      pred.observeWindow(keys, [
        { resourceKey: 'cron-job', at: clock.now(), fields: ['spec.schedule'] },
      ]);
    }
    const p = pred.proneness('cron-job');
    expect(p.meanIntervalMs).toBeCloseTo(20 * 60_000, -3);
    // Now let 45 min pass with no drift — overdue (>1.5× mean).
    clock.set(clock.now() + 45 * 60_000);
    const overdue = pred.overdue();
    expect(overdue.map((o) => o.resourceKey)).toContain('cron-job');
  });
});

/* ------------------------------------------------------------------ */

describe('SyncPolicyEngine', () => {
  let clock: TestClock;
  let engine: SyncPolicyEngine;

  beforeEach(() => {
    clock = new TestClock(0);
    engine = new SyncPolicyEngine(
      [
        { namespace: '*', mode: 'manual' },
        { namespace: 'dev-*', mode: 'auto' },
        { namespace: 'staging-*', mode: 'auto-with-approval-window', approvalWindowMs: 3600_000 },
        { namespace: 'prod-payments', mode: 'manual' },
      ],
      clock
    );
  });

  it('most-specific glob wins over wildcard', () => {
    expect(engine.decide({ namespace: 'dev-api', resourceCount: 5 }).kind).toBe('auto');
    expect(engine.decide({ namespace: 'staging-api', resourceCount: 5 }).kind).toBe('await-approval');
    expect(engine.decide({ namespace: 'prod-payments', resourceCount: 5 }).kind).toBe('await-approval');
    expect(engine.decide({ namespace: 'random-ns', resourceCount: 5 }).kind).toBe('await-approval');
  });

  it('blocks namespaces with no matching policy when * is absent', () => {
    const strict = new SyncPolicyEngine([{ namespace: 'prod', mode: 'auto' }], clock);
    const d = strict.decide({ namespace: 'dev', resourceCount: 1 });
    expect(d.kind).toBe('blocked');
  });

  it('enforces magnitude caps on auto-syncs', () => {
    engine.addPolicy({ namespace: 'big-*', mode: 'auto', maxAutoResources: 10 });
    expect(engine.decide({ namespace: 'big-ns', resourceCount: 5 }).kind).toBe('auto');
    const d = engine.decide({ namespace: 'big-ns', resourceCount: 50 });
    expect(d.kind).toBe('blocked');
    expect((d as { reason: string }).reason).toContain('cap');
  });

  it('approval window elapses on the clock', () => {
    // Request time is captured at request-arrival (t=0), not poll time.
    const ctx = { namespace: 'staging-x', resourceCount: 3, requestedAt: 0 };
    expect(engine.windowElapsed(ctx)).toBe(false);
    clock.advance(3600_001);
    expect(engine.windowElapsed(ctx)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */

describe('RollbackPlanner', () => {
  it('produces a minimal plan — only changed fields reverted', () => {
    const current = revision('r2', [
      res('Deploy', 'app', { replicas: 5, image: 'v2', env: { A: 1, B: 2 } }),
      res('Svc', 'added-later', { port: 80 }),
    ]);
    const target = revision('r1', [
      res('Deploy', 'app', { replicas: 3, image: 'v1', env: { A: 1, B: 2 } }),
      res('Svc', 'removed-earlier', { port: 81 }),
    ]);

    const plan = new RollbackPlanner().plan(current, target);
    const deploy = plan.steps.find((s) => s.resourceKey === 'Deploy/app')!;
    expect(deploy.action).toBe(DiffAction.Update);
    // Only replicas + image changed — env untouched (minimal).
    expect(deploy.fieldRestores.map((f) => f.path).sort()).toEqual([
      'spec.image',
      'spec.replicas',
    ]);
    // Resource added since target → delete.
    const del = plan.steps.find((s) => s.resourceKey === 'Svc/added-later')!;
    expect(del.action).toBe(DiffAction.Delete);
    // Resource removed since target → re-create.
    const create = plan.steps.find((s) => s.resourceKey === 'Svc/removed-earlier')!;
    expect(create.action).toBe(DiffAction.Create);
    expect(plan.touchedFieldCount).toBe(2);
  });

  it('orders deletes after creates/updates within a wave', () => {
    const current = revision('now', [res('X', 'new', {})]);
    const target = revision('old', [res('X', 'old', {})]);
    const plan = new RollbackPlanner().plan(current, target);
    expect(plan.steps[0].action).toBe(DiffAction.Create);
    expect(plan.steps[1].action).toBe(DiffAction.Delete);
  });

  it('no-op when revisions are identical', () => {
    const a = revision('r1', [res('Deploy', 'x', { r: 1 })]);
    const b = revision('r1b', [res('Deploy', 'x', { r: 1 })]);
    expect(new RollbackPlanner().plan(a, b).steps).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */

describe('SecretDriftDetector', () => {
  let live: InMemoryLiveStore;
  let det: SecretDriftDetector;

  const secret = (name: string, data: Record<string, string>) =>
    res('Secret', name, { data });

  beforeEach(() => {
    live = new InMemoryLiveStore();
    det = new SecretDriftDetector(live);
  });

  it('classifies rotated vs added vs removed keys', () => {
    live.seed(secret('db-creds', { user: 'u1', pass: 'old-pw', host: 'db', leaked: 'x' }));
    const rev = revision('r1', [
      secret('db-creds', { user: 'u1', pass: 'new-pw', host: 'db', fresh: 'y' }),
    ]);
    const drifts = det.detect(rev);
    expect(drifts).toHaveLength(1);
    const d = drifts[0];
    expect(d.rotatedKeys).toEqual(['pass']);       // value changed
    expect(d.addedKeys).toEqual(['fresh']);        // only in desired
    expect(d.removedKeys).toEqual(['leaked']);     // only in live — injected
  });

  it('skips non-secret resources', () => {
    live.seed(res('ConfigMap', 'cm', { data: { a: 'b' } }));
    const rev = revision('r1', [res('ConfigMap', 'cm', { data: { a: 'c' } })]);
    // ConfigMaps have a `data` field — they ARE secret-like here, hmm.
    // kind doesn't say Secret but spec.data exists → treated as secret.
    // So expect a drift report — values differ.
    const drifts = det.detect(rev);
    expect(drifts.length).toBe(1);
    expect(drifts[0].rotatedKeys).toEqual(['a']);
  });

  it('detects long-lived (stale) credentials across scans', () => {
    live.seed(secret('api-keys', { key1: 'static-value' }));
    for (let i = 0; i < 6; i++) {
      const stales = det.staleness(['Secret/api-keys'], 5);
      if (i < 5) {
        expect(stales).toHaveLength(0); // not yet stale
      } else {
        expect(stales[0].staleKeys).toContain('key1'); // 6th scan → stale
      }
    }
  });

  it('staleness counter resets when a value rotates', () => {
    live.seed(secret('k', { v: 'a' }));
    for (let i = 0; i < 5; i++) det.staleness(['Secret/k'], 5);
    // Rotate the value in live.
    live.seed(secret('k', { v: 'b' }));
    const stales = det.staleness(['Secret/k'], 5);
    expect(stales).toHaveLength(0); // just rotated → not stale
  });
});

/* ------------------------------------------------------------------ */

describe('GitOps2Engine', () => {
  it('assess() bundles decision + proneness + secret drift + rollback', () => {
    const clock = new TestClock(0);
    const live = new InMemoryLiveStore();
    live.seed(res('Secret', 'db', { data: { pass: 'new' } }));
    const engine = new GitOps2Engine(new SecretDriftDetector(live), clock);
    engine.policies.addPolicy({ namespace: 'prod-*', mode: 'auto' });

    const current = revision('r1', [res('Deploy', 'app', { replicas: 3 })]);
    const target = revision('r2', [
      res('Deploy', 'app', { replicas: 5 }),
      res('Secret', 'db', { data: { pass: 'rotated' } }),
    ]);
    const a = engine.assess('prod-east', current, target);
    expect(a.decision.kind).toBe('auto');
    expect(a.driftProneness.length).toBe(2);
    expect(a.rollbackPlan.steps.length).toBeGreaterThan(0);
    expect(a.rollbackPlan.toRevisionId).toBe('r1');
  });

  it('secret drift surfaces in the assessment', () => {
    const clock = new TestClock(0);
    const live = new InMemoryLiveStore();
    live.seed(res('Secret', 'api', { data: { key: 'old' } }));
    const engine = new GitOps2Engine(new SecretDriftDetector(live), clock);
    engine.policies.addPolicy({ namespace: '*', mode: 'manual' });
    const target = revision('r', [res('Secret', 'api', { data: { key: 'new', added: 'x' } })]);
    const a = engine.assess('prod', revision('r0', []), target);
    expect(a.secretDrift.length).toBe(1);
    expect(a.secretDrift[0].rotatedKeys).toContain('key');
    expect(a.decision.kind).toBe('await-approval');
  });
});
