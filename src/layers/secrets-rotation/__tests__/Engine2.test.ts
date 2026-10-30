/**
 * Secrets Rotation engine2 — unit tests (bun:test)
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { RotationDependencyGraph, DependencyCycleError } from '../engine2/RotationDependencyGraph';
import { SecretUsageTracker } from '../engine2/SecretUsageTracker';
import { ZeroDowntimeRotator, RotationStage, KeyMaterialFactory } from '../engine2/ZeroDowntimeRotator';
import { FleetRotationOrchestrator } from '../engine2/FleetRotationOrchestrator';
import { KeyRing } from '../rotation/KeyRing';
import { KeyMaterial, KeyState, RotationPolicy } from '../rotation/RotationTypes';

function manualClock(start = 1_000_000) {
  let t = start;
  const clock = () => t;
  return { clock, advance: (ms: number) => { t += ms; }, now: () => t };
}

let keyCounter = 0;
function makeFactory(): KeyMaterialFactory {
  return (secretId, generation) => ({
    keyId: `${secretId}-k${++keyCounter}`,
    secretId,
    generation,
    material: new Uint8Array([generation]),
    fingerprint: `fp-${secretId}-${generation}`,
  });
}

function policy(secretId: string, graceMs = 1000): RotationPolicy {
  return { secretId, intervalMs: 60_000, graceMs };
}

// Seed a ring with one ACTIVE key.
function seedRing(secretId: string, clock: () => number): KeyRing {
  const ring = new KeyRing(secretId, clock);
  const m = makeFactory()(secretId, 1) as KeyMaterial;
  ring.add(m);
  ring.transition(m.keyId, KeyState.STAGING);
  ring.transition(m.keyId, KeyState.ACTIVE);
  return ring;
}

// ------------------------------------------------------------ RotationDependencyGraph

describe('RotationDependencyGraph', () => {
  let g: RotationDependencyGraph;
  beforeEach(() => {
    g = new RotationDependencyGraph();
  });

  it('orders dependencies before dependents', () => {
    // db-url derives from db-password; api-config derives from db-url.
    g.addEdge('db-password', 'db-url');
    g.addEdge('db-url', 'api-config');
    const order = g.rotationOrder(['api-config']);
    // Closure pulls in all transitive dependencies.
    expect(order).toEqual(['db-password', 'db-url', 'api-config']);
  });

  it('rejects cycles on insertion', () => {
    g.addEdge('a', 'b');
    g.addEdge('b', 'c');
    expect(() => g.addEdge('c', 'a')).toThrow(DependencyCycleError);
    // The rejected edge was rolled back.
    expect(g.dependentsOf('c')).not.toContain('a');
  });

  it('computes the blast radius of a rotation', () => {
    g.addEdge('root-ca', 'tls-cert');
    g.addEdge('tls-cert', 'nginx-config');
    g.addEdge('root-ca', 'mtls-cert');
    const impacted = g.impactedBy('root-ca');
    expect(impacted).toContain('tls-cert');
    expect(impacted).toContain('nginx-config');
    expect(impacted).toContain('mtls-cert');
    expect(impacted).not.toContain('root-ca');
  });

  it('groups independent secrets into parallel waves', () => {
    g.addEdge('a', 'c');
    g.addEdge('b', 'c');
    g.addEdge('c', 'd');
    const waves = g.waves(['d']);
    expect(waves).toHaveLength(3);
    expect(waves[0].sort()).toEqual(['a', 'b']);
    expect(waves[1]).toEqual(['c']);
    expect(waves[2]).toEqual(['d']);
  });

  it('appends unknown targets without constraints', () => {
    g.addEdge('a', 'b');
    const order = g.rotationOrder(['b', 'standalone']);
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order).toContain('standalone');
  });
});

// ------------------------------------------------------------ SecretUsageTracker

describe('SecretUsageTracker', () => {
  const mc = manualClock();
  let tracker: SecretUsageTracker;
  beforeEach(() => {
    tracker = new SecretUsageTracker({ clock: mc.clock });
  });

  it('tracks which services use which secrets', () => {
    tracker.recordAccess('db-password', 'api-server', 3);
    tracker.recordAccess('db-password', 'worker', 3);
    tracker.recordAccess('api-key', 'api-server', 1);
    expect(tracker.consumersOf('db-password').map((c) => c.serviceId)).toEqual(['api-server', 'worker']);
    expect(tracker.secretsUsedBy('api-server').sort()).toEqual(['api-key', 'db-password']);
  });

  it('detects consumers lagging on old generations', () => {
    tracker.recordAccess('tls', 'lb-1', 5);
    tracker.recordAccess('tls', 'lb-2', 4);
    tracker.recordAccess('tls', 'lb-3'); // unknown generation
    const stale = tracker.staleConsumers('tls', 5);
    expect(stale.map((c) => c.serviceId)).toEqual(['lb-2', 'lb-3']);
  });

  it('safeToRetire only when no recent consumer on old generation', () => {
    tracker.recordAccess('s', 'svc-a', 1);
    expect(tracker.safeToRetire('s', 1, 60_000)).toBe(false);
    mc.advance(120_000);
    expect(tracker.safeToRetire('s', 1, 60_000)).toBe(true);
  });

  it('reports idle secrets', () => {
    tracker.recordAccess('hot', 'svc');
    tracker.recordAccess('cold', 'svc');
    mc.advance(300_000);
    tracker.recordAccess('hot', 'svc'); // keep hot alive
    expect(tracker.idleSecrets(60_000)).toEqual(['cold']);
  });

  it('summarizes usage per secret', () => {
    tracker.recordAccess('s1', 'a', 1);
    tracker.recordAccess('s1', 'a', 2);
    tracker.recordAccess('s1', 'b', 2);
    const r = tracker.report().find((x) => x.secretId === 's1')!;
    expect(r.consumers).toBe(2);
    expect(r.totalAccesses).toBe(3);
    expect(r.activeGenerations).toEqual([1, 2]);
  });
});

// ------------------------------------------------------------ ZeroDowntimeRotator

describe('ZeroDowntimeRotator', () => {
  const mc = manualClock();
  let ring: KeyRing;
  let tracker: SecretUsageTracker;

  beforeEach(() => {
    ring = seedRing('db-password', mc.clock);
    tracker = new SecretUsageTracker({ clock: mc.clock });
  });

  async function driveToEnd(r: ZeroDowntimeRotator, run = r.run!) {
    let guard = 0;
    while (run.stage !== RotationStage.DONE && run.stage !== RotationStage.FAILED && guard++ < 100) {
      const progressed = await r.tick();
      if (!progressed) mc.advance(2000);
    }
    return run;
  }

  it('walks IDLE→…→DONE keeping a valid key at all times', async () => {
    const r = new ZeroDowntimeRotator({ ring, policy: policy('db-password'), factory: makeFactory(), tracker, clock: mc.clock });
    const run = await r.begin();
    expect(run.stage).toBe(RotationStage.STAGING);
    // Staged key must NOT be valid for operations yet.
    expect(ring.canOperate(run.newKeyId!)).toBe(false);
    await driveToEnd(r);
    expect(run.stage).toBe(RotationStage.DONE);
    const active = ring.active()!;
    expect(active.material.generation).toBe(2);
    // Old key revoked after grace.
    expect(ring.get(run.oldKeyId!)!.state).toBe(KeyState.REVOKED);
  });

  it('keeps old key valid through the dual-key window', async () => {
    const r = new ZeroDowntimeRotator({ ring, policy: policy('db-password', 5000), factory: makeFactory(), tracker, clock: mc.clock });
    const run = await r.begin();
    await r.tick(); // STAGING→ACTIVATING→DUAL_KEY
    expect(run.stage).toBe(RotationStage.DUAL_KEY);
    // Old key still validates during grace.
    expect(ring.validate(run.oldKeyId!).valid).toBe(true);
    mc.advance(6000);
    await r.tick(); // →DRAINING→DONE (no consumers → immediate)
    expect(run.stage).toBe(RotationStage.DONE);
    expect(ring.validate(run.oldKeyId!).valid).toBe(false);
  });

  it('waits for stale consumers in DRAINING', async () => {
    tracker.recordAccess('db-password', 'slow-svc', 1); // consumer on old gen
    const r = new ZeroDowntimeRotator({
      ring,
      policy: policy('db-password', 1000),
      factory: makeFactory(),
      tracker,
      clock: mc.clock,
      drainTimeoutMs: 60_000,
    });
    const run = await r.begin();
    await r.tick();
    mc.advance(2000);
    await r.tick(); // →DRAINING, sees slow-svc stale
    expect(run.stage).toBe(RotationStage.DRAINING);
    expect(run.blockers).toContain('slow-svc');
    // Consumer reloads onto gen 2.
    tracker.recordAccess('db-password', 'slow-svc', 2);
    await r.tick();
    expect(run.stage).toBe(RotationStage.DONE);
  });

  it('rolls back a failed activation, restoring the old key', async () => {
    let calls = 0;
    const flaky: KeyMaterialFactory = (s, g) => {
      calls++;
      if (calls === 1) throw new Error('KMS unavailable');
      return makeFactory()(s, g);
    };
    const r = new ZeroDowntimeRotator({ ring, policy: policy('db-password'), factory: flaky, clock: mc.clock });
    const run = await r.begin();
    expect(run.stage).toBe(RotationStage.FAILED);
    r.rollback('test');
    // Old key still ACTIVE and valid — rotation never touched it.
    expect(ring.active()!.material.generation).toBe(1);
  });
});

// ------------------------------------------------------------ FleetRotationOrchestrator

describe('FleetRotationOrchestrator', () => {
  const mc = manualClock();
  let orch: FleetRotationOrchestrator;

  beforeEach(() => {
    orch = new FleetRotationOrchestrator({ clock: mc.clock, advanceClock: mc.advance });
    for (const s of ['db-password', 'db-url', 'api-config']) {
      orch.register(s, policy(s), makeFactory(), seedRing(s, mc.clock));
    }
    orch.graph.addEdge('db-password', 'db-url');
    orch.graph.addEdge('db-url', 'api-config');
  });

  it('rotates a chain in dependency order', async () => {
    const report = await orch.rotate(['api-config']);
    expect(report.succeeded).toBe(3);
    const ids = report.results.map((r) => r.secretId);
    expect(ids.indexOf('db-password')).toBeLessThan(ids.indexOf('db-url'));
    expect(ids.indexOf('db-url')).toBeLessThan(ids.indexOf('api-config'));
    // Each ring now has generation 2 active.
    for (const s of ['db-password', 'db-url', 'api-config']) {
      expect(orch.ringOf(s)!.active()!.material.generation).toBe(2);
    }
  });

  it('skips dependents when a dependency fails', async () => {
    const failing: KeyMaterialFactory = () => {
      throw new Error('HSM down');
    };
    orch.register('db-password', policy('db-password'), failing, seedRing('db-password', mc.clock));
    const report = await orch.rotate(['api-config']);
    const byId = new Map(report.results.map((r) => [r.secretId, r]));
    expect(byId.get('db-password')!.status).toBe('rolled-back');
    expect(byId.get('db-url')!.status).toBe('skipped');
    expect(byId.get('api-config')!.status).toBe('skipped');
    // Old key of failed secret still active.
    expect(orch.ringOf('db-password')!.active()!.material.generation).toBe(1);
  });
});
