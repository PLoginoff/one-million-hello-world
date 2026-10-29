/**
 * Disaster Recovery engine — unit tests (bun:test)
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { DrNode, FailoverState, ObjectiveStatus } from '../dr/DrTypes';
import { fnv1a64, sha256Sim, checksum, firstMismatch } from '../dr/IntegrityChecksum';
import { RtoRpoTracker } from '../dr/RtoRpoTracker';
import { FailoverStateMachine, InvalidFailoverTransition } from '../dr/FailoverStateMachine';
import { BackupVerifier, InMemoryBackupStore, makeArtifact } from '../dr/BackupVerifier';
import { ReplicationLagMonitor } from '../dr/ReplicationLagMonitor';
import { CorruptionDetector } from '../dr/CorruptionDetector';
import { DrDrillRunner } from '../dr/DrDrillRunner';

function fakeClock(start = 1_000_000): { now: () => number; advance: (ms: number) => void; t: () => number } {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms), t: () => t };
}

function node(id: string, position: bigint, healthy = true, lastWriteAt = 0): DrNode {
  return { nodeId: id, region: 'r1', position, appliedPosition: position, lastWriteAt, healthy };
}

// ------------------------------------------------------------------- checksums

describe('IntegrityChecksum', () => {
  it('fnv1a is deterministic and 16 hex chars', () => {
    const a = fnv1a64(new Uint8Array([1, 2, 3]));
    const b = fnv1a64(new Uint8Array([1, 2, 3]));
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it('single-bit change flips the digest (avalanche)', () => {
    const base = new Uint8Array([1, 2, 3, 4]);
    const mod = Uint8Array.from(base);
    mod[0] ^= 1;
    expect(fnv1a64(base)).not.toBe(fnv1a64(mod));
    expect(sha256Sim(base)).not.toBe(sha256Sim(mod));
  });

  it('sha256Sim produces 64 hex chars', () => {
    expect(sha256Sim(new Uint8Array([7]))).toMatch(/^[0-9a-f]{64}$/);
  });

  it('firstMismatch locates the differing byte', () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([1, 2, 9, 4]);
    expect(firstMismatch(a, b)).toBe(2);
    expect(firstMismatch(a, a)).toBe(-1);
    expect(firstMismatch(a, new Uint8Array([1, 2]))).toBe(2);
  });

  it('checksum dispatch honors kind', () => {
    const d = new Uint8Array([5, 6]);
    expect(checksum('fnv1a', d)).toBe(fnv1a64(d));
    expect(checksum('sha256-sim', d)).toBe(sha256Sim(d));
  });
});

// ---------------------------------------------------------------- RtoRpoTracker

describe('RtoRpoTracker', () => {
  it('measures RPO status bands', () => {
    const clk = fakeClock();
    const t = new RtoRpoTracker(clk.now);
    t.registerObjective({ serviceId: 'svc', rtoMs: 1000, rpoMs: 100 });
    expect(t.measureRpo('svc', 50).status).toBe(ObjectiveStatus.MET);
    expect(t.measureRpo('svc', 90).status).toBe(ObjectiveStatus.WARNING); // >80% of 100
    expect(t.measureRpo('svc', 150).status).toBe(ObjectiveStatus.BREACHED);
  });

  it('times disaster→restore as RTO', () => {
    const clk = fakeClock();
    const t = new RtoRpoTracker(clk.now);
    t.registerObjective({ serviceId: 'svc', rtoMs: 1000, rpoMs: 100 });
    t.declareDisaster('svc');
    clk.advance(500);
    const m = t.markRestored('svc');
    expect(m?.measuredMs).toBe(500);
    expect(m?.status).toBe(ObjectiveStatus.MET);
  });

  it('breaches RTO when restore exceeds target', () => {
    const clk = fakeClock();
    const t = new RtoRpoTracker(clk.now);
    t.registerObjective({ serviceId: 'svc', rtoMs: 1000, rpoMs: 100 });
    t.declareDisaster('svc');
    clk.advance(2000);
    expect(t.markRestored('svc')?.status).toBe(ObjectiveStatus.BREACHED);
  });

  it('markRestored is idempotent without open disaster', () => {
    const t = new RtoRpoTracker();
    t.registerObjective({ serviceId: 's', rtoMs: 1, rpoMs: 1 });
    expect(t.markRestored('s')).toBeNull();
  });

  it('atRisk reports services in WARNING/BREACHED', () => {
    const t = new RtoRpoTracker();
    t.registerObjective({ serviceId: 'a', rtoMs: 1000, rpoMs: 100 });
    t.registerObjective({ serviceId: 'b', rtoMs: 1000, rpoMs: 100 });
    t.measureRpo('a', 500); // breached
    t.measureRpo('b', 10); // met
    const risk = t.atRisk().map((r) => r.serviceId);
    expect(risk).toContain('a');
    expect(risk).not.toContain('b');
  });

  it('rejects unregistered services', () => {
    const t = new RtoRpoTracker();
    expect(() => t.measureRpo('ghost', 1)).toThrow();
  });

  it('history is bounded', () => {
    const t = new RtoRpoTracker(Date.now, 5);
    t.registerObjective({ serviceId: 's', rtoMs: 1000, rpoMs: 100 });
    for (let i = 0; i < 20; i++) t.measureRpo('s', i);
    expect(t.history('s').length).toBe(5);
  });
});

// --------------------------------------------------------- FailoverStateMachine

describe('FailoverStateMachine', () => {
  const hooks = {
    repointTraffic: () => undefined,
    verifyWrites: () => true,
  };

  it('enforces transition guards', () => {
    const f = new FailoverStateMachine('p1', hooks);
    expect(() => f.transition(FailoverState.PROMOTING)).toThrow(InvalidFailoverTransition);
    f.transition(FailoverState.DEGRADED, 'primary ping lost');
    expect(f.state).toBe(FailoverState.DEGRADED);
  });

  it('promotes standby with majority quorum', async () => {
    const f = new FailoverStateMachine('p1', hooks);
    f.degrade('p1 lost');
    const candidate = node('s1', 100n);
    const voters = [node('p1', 100n, false), candidate, node('s2', 95n)];
    const result = await f.failover(candidate, voters);
    expect(result.finalState).toBe(FailoverState.FAILED_OVER);
    expect(result.newPrimaryId).toBe('s1');
    expect(result.votesFor).toBe(2);
    expect(result.votesNeeded).toBe(2);
    expect(f.primaryId).toBe('s1');
  });

  it('aborts when quorum not reached (minority partition)', async () => {
    const f = new FailoverStateMachine('p1', hooks);
    f.degrade('p1 lost');
    const candidate = node('s1', 100n);
    // Only candidate healthy out of 5 voters → 1/3 needed fails.
    const voters = [
      node('p1', 100n, false),
      candidate,
      node('s2', 99n, false),
      node('s3', 99n, false),
      node('s4', 99n, false),
    ];
    const result = await f.failover(candidate, voters);
    expect(result.finalState).toBe(FailoverState.ABORTED);
    expect(result.abortReason).toContain('quorum');
    expect(result.newPrimaryId).toBeUndefined();
    expect(f.primaryId).toBe('p1'); // unchanged
  });

  it('refuses to promote a stale standby beyond maxPositionLag', async () => {
    const f = new FailoverStateMachine('p1', hooks, Date.now, 10n);
    f.degrade('p1 lost');
    const candidate = node('s1', 50n); // 50 behind primary's 100
    const voters = [node('p1', 100n, false), candidate, node('s2', 90n)];
    const result = await f.failover(candidate, voters);
    expect(result.finalState).toBe(FailoverState.ABORTED);
    expect(result.abortReason).toContain('stale');
  });

  it('aborts when repoint hook throws', async () => {
    const f = new FailoverStateMachine('p1', {
      repointTraffic: () => {
        throw new Error('dns refused');
      },
      verifyWrites: () => true,
    });
    f.degrade('x');
    const candidate = node('s1', 100n);
    const voters = [node('p1', 100n, false), candidate, node('s2', 100n)];
    const result = await f.failover(candidate, voters);
    expect(result.finalState).toBe(FailoverState.ABORTED);
    expect(result.abortReason).toContain('repoint failed');
  });

  it('aborts when post-failover verification fails', async () => {
    const f = new FailoverStateMachine('p1', {
      repointTraffic: () => undefined,
      verifyWrites: () => false,
    });
    f.degrade('x');
    const candidate = node('s1', 100n);
    const voters = [node('p1', 100n, false), candidate, node('s2', 100n)];
    const result = await f.failover(candidate, voters);
    expect(result.finalState).toBe(FailoverState.ABORTED);
    expect(result.abortReason).toContain('verification failed');
  });

  it('fence hook is invoked before promotion', async () => {
    let fenced: string | undefined;
    const f = new FailoverStateMachine('p1', {
      repointTraffic: () => undefined,
      verifyWrites: () => true,
      fenceOldPrimary: (id) => {
        fenced = id;
      },
    });
    f.degrade('x');
    const candidate = node('s1', 100n);
    await f.failover(candidate, [node('p1', 100n, false), candidate, node('s2', 100n)]);
    expect(fenced).toBe('p1');
  });

  it('failback path: FAILED_OVER → RECOVERING → HEALTHY', async () => {
    const f = new FailoverStateMachine('p1', hooks);
    f.degrade('x');
    const candidate = node('s1', 100n);
    await f.failover(candidate, [node('p1', 100n, false), candidate, node('s2', 100n)]);
    f.beginRecovery('old primary rebuilt');
    expect(f.state).toBe(FailoverState.RECOVERING);
    f.completeRecovery();
    expect(f.state).toBe(FailoverState.HEALTHY);
  });

  it('aborted machine resets to HEALTHY only', async () => {
    const f = new FailoverStateMachine('p1', { repointTraffic: () => { throw new Error('x'); }, verifyWrites: () => true });
    f.degrade('x');
    const candidate = node('s1', 100n);
    await f.failover(candidate, [node('p1', 100n, false), candidate, node('s2', 100n)]);
    expect(f.state).toBe(FailoverState.ABORTED);
    expect(() => f.transition(FailoverState.PROMOTING)).toThrow(InvalidFailoverTransition);
    f.reset('operator');
    expect(f.state).toBe(FailoverState.HEALTHY);
  });
});

// ---------------------------------------------------------------- BackupVerifier

describe('BackupVerifier', () => {
  let store: InMemoryBackupStore;
  let verifier: BackupVerifier;
  const payload = new Uint8Array([10, 20, 30, 40, 50]);

  beforeEach(() => {
    store = new InMemoryBackupStore();
    verifier = new BackupVerifier(store);
  });

  it('verifies a good backup', async () => {
    const a = makeArtifact('b1', 'svc', 100n, payload, 'sha256-sim', 0);
    store.put(a);
    const r = await verifier.verify('b1');
    expect(r.verified).toBe(true);
    expect(r.restoredBytes).toBe(payload.length);
  });

  it('detects corrupted payload', async () => {
    const a = makeArtifact('b1', 'svc', 100n, payload, 'fnv1a', 0);
    store.put(a);
    store.corrupt('b1', 2);
    const r = await verifier.verify('b1');
    expect(r.verified).toBe(false);
    expect(r.error).toContain('checksum');
  });

  it('detects size mismatch', async () => {
    const a = makeArtifact('b1', 'svc', 100n, payload, 'fnv1a', 0);
    const truncated: typeof a = { ...a, sizeBytes: 999 };
    store.put(truncated);
    const r = await verifier.verify('b1');
    expect(r.verified).toBe(false);
    expect(r.error).toContain('size mismatch');
  });

  it('detects position regression across backups', async () => {
    store.put(makeArtifact('b1', 'svc', 200n, payload, 'fnv1a', 0));
    store.put(makeArtifact('b2', 'svc', 100n, payload, 'fnv1a', 0));
    expect((await verifier.verify('b1')).verified).toBe(true);
    expect((await verifier.verify('b2')).verified).toBe(false); // position 100 < 200
  });

  it('missing payload fails verification', async () => {
    const meta = makeArtifact('ghost', 'svc', 1n, payload, 'fnv1a', 0);
    const store2 = new InMemoryBackupStore();
    // put only metadata by manually inserting then removing payload — simulate
    // by a store that returns meta but null payload.
    const v = new BackupVerifier({
      fetchMetadata: () => meta,
      fetchPayload: () => null,
    });
    const r = await v.verify('ghost');
    expect(r.verified).toBe(false);
    expect(r.error).toBe('payload not found');
    void store2;
  });

  it('passRate aggregates recent results', async () => {
    // 'bad' gets the higher position so the good verify (pos 1) doesn't
    // trigger the position-regression guard when 'bad' (pos 2) is checked.
    store.put(makeArtifact('good', 'svc', 1n, payload, 'fnv1a', 0));
    store.put(makeArtifact('bad', 'svc', 2n, payload, 'fnv1a', 0));
    store.corrupt('bad', 0);
    await verifier.verify('good');
    await verifier.verify('bad');
    expect(verifier.passRate()).toBe(0.5);
  });
});

// ---------------------------------------------------------- ReplicationLagMonitor

describe('ReplicationLagMonitor', () => {
  it('zero lag when replica is caught up', () => {
    const clk = fakeClock();
    const m = new ReplicationLagMonitor(clk.now);
    const primary = node('p', 1000n);
    const replica = node('r', 1000n);
    m.registerReplica('r', replica, 500);
    const r = m.observe(primary, replica);
    expect(r.positionLag).toBe(0n);
    expect(r.withinRpo).toBe(true);
  });

  it('estimates time lag from apply rate', () => {
    const clk = fakeClock(0);
    const m = new ReplicationLagMonitor(clk.now);
    const replica = node('r', 0n);
    m.registerReplica('r', replica, 10_000);
    const primary = node('p', 10_000n);

    // First observation establishes rate baseline.
    m.observe(primary, replica);
    // Replica applies 1000 positions in 100ms → 10 pos/ms.
    clk.advance(100);
    replica.appliedPosition = 1000n;
    const r = m.observe(primary, replica);
    expect(r.positionLag).toBe(9000n);
    // 9000 / 10 ≈ 900ms — inside the 10s RPO.
    expect(r.timeLagMs).toBeGreaterThan(0);
    expect(r.withinRpo).toBe(true);
  });

  it('breaches RPO when lag exceeds budget', () => {
    const clk = fakeClock(0);
    const m = new ReplicationLagMonitor(clk.now);
    const replica = node('r', 0n, true, 0);
    m.registerReplica('r', replica, 50); // tiny 50ms RPO
    // Wall clock far ahead of replica's last write → fallback lag huge.
    clk.advance(60_000);
    const r = m.observe(node('p', 1_000_000n), replica);
    expect(r.withinRpo).toBe(false);
    expect(m.breaching().map((b) => b.replicaId)).toContain('r');
  });

  it('throws for unregistered replica', () => {
    const m = new ReplicationLagMonitor();
    expect(() => m.observe(node('p', 1n), node('x', 1n))).toThrow();
  });

  it('EWMA smoothing damps single-observation spikes', () => {
    const clk = fakeClock(0);
    const m = new ReplicationLagMonitor(clk.now, 0.3);
    const replica = node('r', 0n);
    m.registerReplica('r', replica, 1e9);
    const primary = node('p', 0n);
    m.observe(primary, replica);
    for (let i = 1; i <= 5; i++) {
      clk.advance(100);
      replica.appliedPosition += 1000n;
      primary.position += 1000n;
      m.observe(primary, replica);
    }
    // Steady state: no lag.
    expect(m.smoothedLagMs('r')).toBeLessThan(1);
    expect(m.estimatedRate('r')).toBeCloseTo(10, 0);
  });
});

// ------------------------------------------------------------- CorruptionDetector

describe('CorruptionDetector', () => {
  const segs = (n: number): { segmentId: string; bytes: Uint8Array }[] =>
    Array.from({ length: n }, (_, i) => ({
      segmentId: `seg-${i}`,
      bytes: new Uint8Array([i, i + 1, i + 2]),
    }));

  it('clean scan when nothing changed', () => {
    const d = new CorruptionDetector();
    const s = segs(3);
    d.captureManifest(s, 'fnv1a');
    const report = d.scan(s.map((x) => ({ segmentId: x.segmentId, bytes: Uint8Array.from(x.bytes) })));
    expect(report.corrupt).toBe(0);
    expect(report.clean).toBe(3);
  });

  it('detects flipped byte and localizes offset', () => {
    const d = new CorruptionDetector();
    const s = segs(2);
    d.captureManifest(s, 'sha256-sim');
    const damaged = s.map((x) => ({ segmentId: x.segmentId, bytes: Uint8Array.from(x.bytes) }));
    damaged[1].bytes[1] ^= 0xff;
    const report = d.scan(damaged);
    expect(report.corrupt).toBe(1);
    const finding = report.findings.find((f) => f.corrupt);
    expect(finding?.segmentId).toBe('seg-1');
    expect(finding?.firstMismatchOffset).toBe(1);
  });

  it('flags unmanifested segments as unverified', () => {
    const d = new CorruptionDetector();
    d.captureManifest(segs(1), 'fnv1a');
    const report = d.scan(segs(3)); // seg-1, seg-2 not in manifest
    expect(report.unverified).toBe(2);
    expect(report.clean).toBe(1);
  });

  it('check() is a cheap single-segment verify', () => {
    const d = new CorruptionDetector();
    const s = segs(1);
    d.captureManifest(s, 'fnv1a');
    expect(d.check({ segmentId: 'seg-0', bytes: Uint8Array.from(s[0].bytes) }).corrupt).toBe(false);
    const bad = Uint8Array.from(s[0].bytes);
    bad[0] ^= 1;
    expect(d.check({ segmentId: 'seg-0', bytes: bad }).corrupt).toBe(true);
  });
});

// ---------------------------------------------------------------- DrDrillRunner

describe('DrDrillRunner', () => {
  function buildDrill(opts: { corruptBackup?: boolean; failRepoint?: boolean; lagBehind?: bigint } = {}) {
    const clk = fakeClock();
    const store = new InMemoryBackupStore();
    const verifier = new BackupVerifier(store, clk.now);
    const tracker = new RtoRpoTracker(clk.now);
    const lag = new ReplicationLagMonitor(clk.now);
    const corruption = new CorruptionDetector(clk.now);

    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    store.put(makeArtifact('bk-1', 'svc', 500n, payload, 'sha256-sim', clk.now()));
    if (opts.corruptBackup) store.corrupt('bk-1', 1);

    const segments = [{ segmentId: 'restored-0', bytes: payload }];
    corruption.captureManifest(segments, 'sha256-sim');

    const candidate = node('s1', 500n - (opts.lagBehind ?? 0n), true, clk.now());
    lag.registerReplica('s1', candidate, 60_000);

    const runner = new DrDrillRunner(verifier, tracker, lag, corruption, clk.now);
    const plan = {
      drillId: 'drill-1',
      objective: { serviceId: 'svc', rtoMs: 60_000, rpoMs: 60_000 },
      backupId: 'bk-1',
      candidate,
      voters: [node('p1', 500n, false), candidate, node('s2', 490n)],
      failoverHooks: {
        repointTraffic: () => {
          if (opts.failRepoint) throw new Error('repoint failed');
        },
        verifyWrites: () => true,
      },
      restoredSegments: segments.map((s) => ({ segmentId: s.segmentId, bytes: Uint8Array.from(s.bytes) })),
    };
    return { runner, plan, clk };
  }

  it('scores a perfect drill at 1.0', async () => {
    const { runner, plan } = buildDrill();
    const report = await runner.run(plan);
    expect(report.score).toBeCloseTo(1, 10);
    expect(report.steps.every((s) => s.passed)).toBe(true);
    expect(report.rtoMet).toBe(true);
  });

  it('loses backup-verified credit on corruption', async () => {
    const { runner, plan } = buildDrill({ corruptBackup: true });
    const report = await runner.run(plan);
    expect(report.score).toBeLessThan(1);
    expect(report.steps.find((s) => s.step === 'backup-verified')?.passed).toBe(false);
  });

  it('loses failover + RTO credit when repoint fails', async () => {
    const { runner, plan } = buildDrill({ failRepoint: true });
    const report = await runner.run(plan);
    expect(report.steps.find((s) => s.step === 'failover-executed')?.passed).toBe(false);
    expect(report.steps.find((s) => s.step === 'rto-met')?.passed).toBe(false);
    expect(report.score).toBeLessThanOrEqual(0.5);
  });
});
