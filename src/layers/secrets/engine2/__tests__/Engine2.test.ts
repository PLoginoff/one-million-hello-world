/**
 * Tests for secrets engine2: SecretVersionHistory, AccessTracker,
 * RotationPlanner, SecretTemplates and AccessAnomalyDetector.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { SecretVersionHistory } from '../VersionHistory';
import { AccessTracker } from '../AccessTracker';
import { RotationPlanner } from '../RotationPlanner';
import { SecretTemplates } from '../SecretTemplates';
import { AccessAnomalyDetector, replayAuditLog } from '../AccessAnomalyDetector';
import { LeaseStore, StoredLease } from '../LeaseStore';
import type { SecretProvider, SecretRead } from '../../vault/SecretTypes';
import type { AuditEntry } from '../../vault/SecretTypes';

class FakeClock {
  t = 1_700_000_000_000;
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
}

/** Minimal SecretProvider backed by a version map — tests only. */
class MemProvider implements SecretProvider {
  readonly name = 'mem';
  private _data = new Map<string, SecretRead[]>();

  async get(path: string): Promise<SecretRead | undefined> {
    const vs = this._data.get(path);
    return vs?.[vs.length - 1];
  }
  async getVersion(path: string, version: number): Promise<SecretRead | undefined> {
    return this._data.get(path)?.find((r) => r.version === version);
  }
  async put(path: string, value: string, _createdBy?: string): Promise<number> {
    const vs = this._data.get(path) ?? [];
    const v = vs.length + 1;
    vs.push({ path, value, version: v, createdAt: v * 1000 });
    this._data.set(path, vs);
    return v;
  }
  async delete(path: string): Promise<boolean> {
    return this._data.delete(path);
  }
  async list(): Promise<readonly string[]> {
    return [...this._data.keys()];
  }
  async versions(path: string): Promise<readonly number[]> {
    return (this._data.get(path) ?? []).map((r) => r.version);
  }
}

describe('SecretVersionHistory', () => {
  let provider: MemProvider;
  let clock: FakeClock;
  let hist: SecretVersionHistory;

  beforeEach(() => {
    provider = new MemProvider();
    clock = new FakeClock();
    hist = new SecretVersionHistory(provider, () => clock.now());
  });

  it('snapshot lists versions with state and fingerprint', async () => {
    await provider.put('db/pass', 'v1-value');
    await provider.put('db/pass', 'v2-value');
    const snap = await hist.snapshot('db/pass');
    expect(snap).toHaveLength(2);
    expect(snap[0].state).toBe('superseded');
    expect(snap[1].state).toBe('current');
    expect(snap[0].valueFingerprint).not.toBe(snap[1].valueFingerprint);
  });

  it('rollback writes the old value as a new head version', async () => {
    await provider.put('db/pass', 'original');
    await provider.put('db/pass', 'rotated');
    const newV = await hist.rollback('db/pass', 1, 'ops-alice');
    expect(newV).toBe(3);
    const head = await provider.get('db/pass');
    expect(head!.value).toBe('original');
  });

  it('rollback throws on unknown version', async () => {
    await provider.put('x', 'a');
    await expect(hist.rollback('x', 99, 'me')).rejects.toThrow('99');
  });

  it('diff reports value change without exposing it', async () => {
    await provider.put('k', 'aaa');
    await provider.put('k', 'aaa'); // same value, new version
    await provider.put('k', 'bbb');
    const d12 = await hist.diff('k', 1, 2);
    const d13 = await hist.diff('k', 1, 3);
    expect(d12.valueChanged).toBe(false);
    expect(d13.valueChanged).toBe(true);
  });

  it('timeline orders created events chronologically', async () => {
    await provider.put('s', 'a');
    await provider.put('s', 'b');
    const tl = await hist.timeline('s');
    expect(tl.map((e) => e.event)).toEqual(['created', 'created']);
    expect(tl[1].version).toBe(2);
  });
});

describe('AccessTracker', () => {
  let clock: FakeClock;
  let tracker: AccessTracker;

  beforeEach(() => {
    clock = new FakeClock();
    tracker = new AccessTracker({ clock: () => clock.now(), bucketMs: 60_000, retentionMs: 300_000 });
  });

  it('aggregates consumers per path', () => {
    tracker.record('svc-a', 'db/pass', 'read');
    tracker.record('svc-a', 'db/pass', 'read');
    tracker.record('svc-b', 'db/pass', 'read');
    const c = tracker.consumers('db/pass');
    expect(c).toHaveLength(2);
    expect(c[0].principal).toBe('svc-a');
    expect(c[0].count).toBe(2);
  });

  it('footprint lists a principal\'s touched paths with top action', () => {
    tracker.record('svc-a', 'db/pass', 'read');
    tracker.record('svc-a', 'api/key', 'write');
    tracker.record('svc-a', 'api/key', 'write');
    const fp = tracker.footprint('svc-a');
    expect(fp).toHaveLength(2);
    expect(fp[0].path).toBe('api/key');
    expect(fp[0].topAction).toBe('write');
  });

  it('windowed counts respect the sliding horizon', () => {
    tracker.record('p', 's', 'read');
    clock.advance(200_000);
    tracker.record('p', 's', 'read');
    expect(tracker.windowed('p', 's', 300_000)).toBe(2);
    expect(tracker.windowed('p', 's', 60_000)).toBe(1); // only the recent hit
  });

  it('hotSecrets ranks globally by count', () => {
    for (let i = 0; i < 5; i++) tracker.record('a', 'hot', 'read');
    tracker.record('b', 'cold', 'read');
    const hot = tracker.hotSecrets(1);
    expect(hot[0].path).toBe('hot');
    expect(hot[0].count).toBe(5);
  });
});

describe('RotationPlanner', () => {
  let clock: FakeClock;
  let planner: RotationPlanner;

  beforeEach(() => {
    clock = new FakeClock();
    planner = new RotationPlanner({ clock: () => clock.now() });
  });

  it('due() returns paths past their jittered due time', () => {
    planner.register({ path: 'a', intervalMs: 1000 });
    planner.register({ path: 'b', intervalMs: 5000 });
    clock.advance(2000);
    expect(planner.due().map((s) => s.path)).toEqual(['a']);
  });

  it('jitter is deterministic per path', () => {
    const s1 = planner.register({ path: 'x', intervalMs: 1000, jitterMs: 500 });
    const p2 = new RotationPlanner({ clock: () => clock.now() });
    const s2 = p2.register({ path: 'x', intervalMs: 1000, jitterMs: 500 });
    expect(s1.dueAt).toBe(s2.dueAt);
    expect(s1.dueAt).toBeGreaterThanOrEqual(s1.scheduledAt);
  });

  it('onRotated reschedules and resets failures', () => {
    planner.register({ path: 'a', intervalMs: 1000 });
    const s = planner.state('a')!;
    s.consecutiveFailures = 3;
    planner.onRotated('a');
    const after = planner.state('a')!;
    expect(after.consecutiveFailures).toBe(0);
    expect(after.lastRotatedAt).toBe(clock.now());
    expect(after.dueAt).toBeGreaterThan(clock.now());
  });

  it('onFailed applies exponential backoff capped by maxBackoffMs', () => {
    planner.register({ path: 'a', intervalMs: 1000, maxBackoffMs: 4000 });
    planner.onFailed('a');
    expect(planner.state('a')!.dueAt).toBe(clock.now() + 2000); // 2^1 × 1000
    planner.onFailed('a');
    expect(planner.state('a')!.dueAt).toBe(clock.now() + 4000); // 2^2 × 1000
    planner.onFailed('a'); // capped at 4000
    expect(planner.state('a')!.dueAt).toBe(clock.now() + 4000);
  });

  it('plan() emits a forward calendar within the horizon', () => {
    planner.register({ path: 'a', intervalMs: 1000, graceMs: 500 });
    const plan = planner.plan(10_000);
    expect(plan.length).toBeGreaterThan(5);
    expect(plan[0].rotateAt).toBe(planner.state('a')!.dueAt);
    expect(plan[0].graceEndsAt).toBe(plan[0].rotateAt + 500);
  });

  it('warns when grace exceeds interval', () => {
    planner.register({ path: 'bad', intervalMs: 120_000, graceMs: 3_600_000 });
    planner.register({ path: 'short', intervalMs: 1_000, graceMs: 500 });
    const w = planner.warnings();
    const grace = w.filter((x) => x.warning === 'grace-exceeds-interval');
    const short = w.filter((x) => x.warning === 'interval-too-short');
    expect(grace).toHaveLength(1);
    expect(grace[0].path).toBe('bad');
    // 'short' at 1s and 'bad' at 120s (≥60s) → only 'short' warned there.
    expect(short.map((x) => x.path)).toEqual(['short']);
  });
});

describe('SecretTemplates', () => {
  let tpl: SecretTemplates;

  beforeEach(() => {
    tpl = new SecretTemplates();
  });

  it('has built-in db-connection and api-key shapes', () => {
    expect(tpl.template('db-connection')).toBeDefined();
    expect(tpl.template('api-key')).toBeDefined();
    expect(tpl.template('nope')).toBeUndefined();
  });

  it('validates required fields and types', () => {
    const issues = tpl.validate('db-connection', { host: 'x' });
    expect(issues.some((i) => i.field === 'port' && i.issue === 'missing')).toBe(true);
    expect(issues.some((i) => i.field === 'password' && i.issue === 'missing')).toBe(true);
    const typeIssues = tpl.validate('db-connection', {
      host: 'x', port: 'not-a-number', database: 'd', username: 'u', password: 'p',
    });
    expect(typeIssues.some((i) => i.field === 'port' && i.issue === 'type')).toBe(true);
  });

  it('encode produces a self-describing payload; decode round-trips', () => {
    const payload = tpl.encode('api-key', { key: 'abc', keyId: 'id1' });
    expect(tpl.isTemplated(payload)).toBe(true);
    const d = tpl.decode(payload);
    expect(d.template).toBe('api-key');
    expect(d.version).toBe(1);
    expect(d.fields).toEqual({ key: 'abc', keyId: 'id1' });
  });

  it('encode refuses invalid values', () => {
    expect(() => tpl.encode('db-connection', { host: 'x' })).toThrow('validation failed');
  });

  it('versioned templates decode old payloads after a schema bump', () => {
    const v1Payload = tpl.encode('api-key', { key: 'old' }); // v1
    tpl.define('api-key', [
      { name: 'key', type: 'string', required: true },
      { name: 'region', type: 'string', required: true }, // new required field
    ]);
    expect(tpl.versions('api-key')).toEqual([1, 2]);
    // v1 payload still decodes under v1 rules.
    expect(tpl.decode(v1Payload).version).toBe(1);
    // v2 encode requires the new field.
    expect(() => tpl.encode('api-key', { key: 'x' })).toThrow();
  });

  it('decode rejects untemplated or unknown-version payloads', () => {
    expect(() => tpl.decode('{"hello":1}')).toThrow('not a templated');
    expect(() => tpl.decode('{"_tpl":"api-key@99","f":{}}')).toThrow('api-key@99');
  });

  it('url field type requires http(s)', () => {
    const issues = tpl.validate('oauth-client', {
      clientId: 'a', clientSecret: 'b', issuer: 'not-a-url',
    });
    expect(issues.some((i) => i.field === 'issuer' && i.issue === 'type')).toBe(true);
  });
});

describe('AccessAnomalyDetector', () => {
  let clock: FakeClock;
  let detector: AccessAnomalyDetector;
  let seq = 0;

  const entry = (
    principal: string,
    path: string,
    action: AuditEntry['action'] = 'read',
    at?: number
  ): AuditEntry => ({
    seq: ++seq,
    at: at ?? clock.now(),
    principal,
    path,
    action,
    success: true,
  });

  beforeEach(() => {
    clock = new FakeClock();
    seq = 0;
    detector = new AccessAnomalyDetector({
      clock: () => clock.now(),
      novelPrefixes: ['prod/'],
      offHours: [2, 5],
      enumerationThreshold: 5,
      zThreshold: 2,
    });
  });

  it('flags first-touch on a novel prefix', () => {
    const a = detector.observe(entry('svc', 'prod/db/pass'))!;
    expect(a.signals.some((s) => s.kind === 'novel')).toBe(true);
    // Second touch on the same path is not novel.
    expect(detector.observe(entry('svc', 'prod/db/pass'))).toBeNull();
    // Non-prod first touches don't alert on novelty.
    expect(detector.observe(entry('svc', 'dev/db/pass'))).toBeNull();
  });

  it('flags off-hours access for a principal without off-hours history', () => {
    // 2023-11-14T03:00:00Z → hour 3, inside [2,5).
    const t = Date.UTC(2023, 10, 14, 3, 0, 0);
    const a = detector.observe(entry('svc', 'x', 'read', t))!;
    expect(a.signals.some((s) => s.kind === 'off-hours')).toBe(true);
    // Same principal later in the band → history exists, no signal.
    const b = detector.observe(entry('svc', 'y', 'read', t + 1000));
    expect(b?.signals.some((s) => s.kind === 'off-hours') ?? false).toBe(false);
  });

  it('flags enumeration: too many distinct paths in the window', () => {
    let alert = null;
    for (let i = 0; i < 6; i++) {
      const a = detector.observe(entry('rogue', `path-${i}`, 'read'));
      if (a?.signals.some((s) => s.kind === 'enumeration')) alert = a;
    }
    expect(alert).not.toBeNull();
    expect(alert!.score).toBeGreaterThanOrEqual(3);
  });

  it('volume z-score fires after a trained baseline is exceeded', () => {
    // Train: 20 minutes × ~5 reads each.
    for (let m = 0; m < 20; m++) {
      const base = m * 60_000;
      for (let i = 0; i < 5; i++) {
        detector.observe(entry('svc', 'p', 'read', base + i * 100));
      }
    }
    expect(detector.baseline('svc')!.n).toBeGreaterThanOrEqual(10);
    // Burst: 200 reads in the next minute → z = (200−5)/0.
    let alert = null;
    const burstBase = 20 * 60_000;
    for (let i = 0; i < 200; i++) {
      const a = detector.observe(entry('svc', 'p', 'read', burstBase + i));
      if (a?.signals.some((s) => s.kind === 'volume')) alert = a;
    }
    expect(alert).not.toBeNull();
    expect(alert!.signals.find((s) => s.kind === 'volume')!.detail).toContain('z=');
  });

  it('writes do not train the read-rate baseline', () => {
    for (let i = 0; i < 30; i++) {
      detector.observe(entry('admin', 'k', 'write'));
    }
    expect(detector.baseline('admin')).toBeNull();
  });

  it('replayAuditLog sorts by seq and collects alerts', () => {
    const entries: AuditEntry[] = [
      { seq: 2, at: 0, principal: 'p', path: 'prod/b', action: 'read', success: true },
      { seq: 1, at: 0, principal: 'p', path: 'prod/a', action: 'read', success: true },
    ];
    const alerts = replayAuditLog(entries, detector);
    expect(alerts.length).toBe(2); // both novel prod paths
  });
});

describe('LeaseStore', () => {
  let clock: FakeClock;
  let store: LeaseStore;

  const mkLease = (
    leaseId: string,
    path: string,
    principal: string,
    opts?: { ttlMs?: number; parentId?: string; renewable?: boolean; maxMs?: number }
  ): StoredLease => ({
    leaseId,
    path,
    principal,
    value: 'secret',
    issuedAt: clock.now(),
    expiresAt: clock.now() + (opts?.ttlMs ?? 60_000),
    renewable: opts?.renewable ?? true,
    maxExpiresAt: clock.now() + (opts?.maxMs ?? 300_000),
    parentId: opts?.parentId,
    revoked: false,
    renewals: 0,
    renewalLog: [],
  });

  beforeEach(() => {
    clock = new FakeClock();
    store = new LeaseStore({ clock: () => clock.now() });
  });

  it('indexes by path and principal; lazy-expires stale leases', () => {
    store.issue(mkLease('l1', 'db/creds', 'svc-a'));
    store.issue(mkLease('l2', 'db/creds', 'svc-b', { ttlMs: 1000 }));
    expect(store.onPath('db/creds')).toHaveLength(2);
    expect(store.ofPrincipal('svc-a')).toHaveLength(1);
    clock.advance(2_000);
    expect(store.get('l2')).toBeUndefined(); // expired lazily
    expect(store.record('l2')).toBeDefined(); // audit view still sees it
  });

  it('renews within maxExpiresAt and logs the chain', () => {
    store.issue(mkLease('l1', 'db', 'svc', { ttlMs: 60_000, maxMs: 200_000 }));
    expect(store.renew('l1', clock.now() + 120_000)).toBe(true);
    expect(store.get('l1')!.expiresAt).toBe(clock.now() + 120_000);
    expect(store.get('l1')!.renewals).toBe(1);
    // Cap at maxExpiresAt.
    expect(store.renew('l1', clock.now() + 999_000)).toBe(true);
    expect(store.get('l1')!.expiresAt).toBe(clock.now() + 200_000);
    expect(store.renew('l1', clock.now() + 100)).toBe(false); // can't shorten
  });

  it('revoking a parent cascades to sub-leases', () => {
    store.issue(mkLease('p1', 'db', 'svc'));
    store.issue(mkLease('c1', 'db', 'svc', { parentId: 'p1' }));
    store.issue(mkLease('c2', 'db', 'svc', { parentId: 'c1' }));
    store.issue(mkLease('other', 'db', 'svc'));
    const revoked = store.revoke('p1');
    expect(revoked.sort()).toEqual(['c1', 'c2', 'p1']);
    expect(store.get('c2')).toBeUndefined();
    expect(store.get('other')).toBeDefined();
  });

  it('revokePath kills every lease on a path (rotation cascade)', () => {
    store.issue(mkLease('l1', 'db', 'a'));
    store.issue(mkLease('l2', 'db', 'b'));
    store.issue(mkLease('l3', 'api', 'c'));
    expect(store.revokePath('db').sort()).toEqual(['l1', 'l2']);
    expect(store.onPath('db')).toHaveLength(0);
    expect(store.onPath('api')).toHaveLength(1);
  });

  it('sweep purges expired and revoked records', () => {
    store.issue(mkLease('l1', 'x', 'a', { ttlMs: 1000 }));
    store.issue(mkLease('l2', 'x', 'a'));
    clock.advance(2_000);
    store.revoke('l2');
    expect(store.sweep()).toBe(2);
    expect(store.size).toBe(0);
  });

  it('expiringSoon lists live leases inside the horizon, sorted', () => {
    store.issue(mkLease('soon', 'x', 'a', { ttlMs: 5_000 }));
    store.issue(mkLease('later', 'x', 'a', { ttlMs: 500_000 }));
    const list = store.expiringSoon(10_000);
    expect(list.map((l) => l.leaseId)).toEqual(['soon']);
  });
});
