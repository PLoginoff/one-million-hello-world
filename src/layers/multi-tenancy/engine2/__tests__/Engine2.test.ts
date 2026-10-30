/**
 * Tests for multi-tenancy engine2: TenantProvisioner (saga/rollback),
 * TenantMeter, IsolationVerifier, TierManager, CrossTenantAdmin.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  CrossTenantAdmin,
  DowngradeBlockedError,
  IsolationVerifier,
  ProvisioningError,
  TenantMeter,
  TenantProvisioner,
  TenantStatus,
  TestClock,
  TierManager,
} from '..';
import type { TenantTier, ProvisionStep } from '..';

const TIERS: TenantTier[] = [
  { id: 'free', name: 'Free', maxUsers: 5, priceCents: 0, limits: { 'api-calls': 1000, 'storage-mb': 100 } },
  { id: 'pro', name: 'Pro', maxUsers: 50, priceCents: 4900, limits: { 'api-calls': 100_000, 'storage-mb': 10_000 } },
  { id: 'ent', name: 'Enterprise', maxUsers: 5000, priceCents: 99900, limits: { 'api-calls': Infinity, 'storage-mb': Infinity } },
];

function makeSteps(failAt?: string): { steps: ProvisionStep[]; created: string[]; rolledBack: string[] } {
  const created: string[] = [];
  const rolledBack: string[] = [];
  const mk = (name: string): ProvisionStep => ({
    name,
    create: () => {
      if (name === failAt) throw new Error(`boom at ${name}`);
      created.push(name);
    },
    rollback: () => {
      rolledBack.push(name);
    },
  });
  return { steps: [mk('schema'), mk('admin-user'), mk('seed-data')], created, rolledBack };
}

describe('TenantProvisioner', () => {
  let clock: TestClock;
  let prov: TenantProvisioner;

  beforeEach(() => {
    clock = new TestClock(0);
    prov = new TenantProvisioner(TIERS, makeSteps().steps, clock);
  });

  it('provisions a tenant with all resources atomically', async () => {
    const t = await prov.provision('acme', 'pro');
    expect(t.status).toBe(TenantStatus.Active);
    expect(t.resources).toEqual(['schema', 'admin-user', 'seed-data']);
    expect(t.tierId).toBe('pro');
    expect(prov.get(t.id)).not.toBeNull();
  });

  it('rolls back completed steps LIFO on failure and removes the record', async () => {
    const { steps, created, rolledBack } = makeSteps('seed-data');
    prov = new TenantProvisioner(TIERS, steps, clock);
    try {
      await prov.provision('bad', 'free');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ProvisioningError);
      expect((e as ProvisioningError).failedStep).toBe('seed-data');
    }
    expect(created).toEqual(['schema', 'admin-user']);
    // LIFO rollback: admin-user then schema.
    expect(rolledBack).toEqual(['admin-user', 'schema']);
    // No tenant left behind.
    expect(prov.list().length).toBe(0);
  });

  it('rejects provisioning with an unknown tier', async () => {
    await expect(prov.provision('x', 'platinum')).rejects.toThrow('Unknown tier');
  });

  it('suspends and resumes active tenants', async () => {
    const t = await prov.provision('acme', 'pro');
    prov.suspend(t.id);
    expect(prov.get(t.id)!.status).toBe(TenantStatus.Suspended);
    expect(() => prov.suspend(t.id)).toThrow();
    prov.resume(t.id);
    expect(prov.get(t.id)!.status).toBe(TenantStatus.Active);
  });

  it('deprovisions with reverse-order rollback', async () => {
    const { steps, rolledBack } = makeSteps();
    prov = new TenantProvisioner(TIERS, steps, clock);
    const t = await prov.provision('acme', 'free');
    const { rollbackErrors } = await prov.deprovision(t.id);
    expect(rollbackErrors).toEqual([]);
    expect(rolledBack).toEqual(['seed-data', 'admin-user', 'schema']);
    expect(prov.get(t.id)).toBeNull();
  });
});

describe('TenantMeter', () => {
  let clock: TestClock;
  let prov: TenantProvisioner;
  let meter: TenantMeter;

  beforeEach(async () => {
    clock = new TestClock(0);
    prov = new TenantProvisioner(TIERS, makeSteps().steps, clock);
    meter = new TenantMeter(prov, clock);
    await prov.provision('small', 'free');
    await prov.provision('big', 'ent');
  });

  it('aggregates per-period usage and flags tier overages', async () => {
    const small = prov.list().find((t) => t.name === 'small')!;
    meter.record(small.id, 'api-calls', 600);
    clock.advance(1000);
    meter.record(small.id, 'api-calls', 600); // 1200 > free limit 1000
    meter.record(small.id, 'storage-mb', 50);
    const sum = meter.summarize(small.id, 0, 2000);
    expect(sum.totals['api-calls']).toBe(1200);
    expect(sum.overages['api-calls']).toBe(true);
    expect(sum.overages['storage-mb']).toBe(false);
  });

  it('ignores events outside the period window', async () => {
    const t = prov.list()[0]!;
    meter.record(t.id, 'api-calls', 500);
    clock.advance(10_000);
    meter.record(t.id, 'api-calls', 500);
    const sum = meter.summarize(t.id, 0, 5000);
    expect(sum.totals['api-calls']).toBe(500);
  });

  it('predicts breaches via wouldExceed', async () => {
    const t = prov.list().find((x) => x.name === 'small')!;
    meter.record(t.id, 'api-calls', 900);
    expect(meter.wouldExceed(t.id, 'api-calls', 50, 0)).toBe(false);
    expect(meter.wouldExceed(t.id, 'api-calls', 200, 0)).toBe(true);
  });

  it('rejects metering unknown tenants', async () => {
    expect(() => meter.record('ghost', 'api-calls', 1)).toThrow('Unknown tenant');
  });
});

describe('IsolationVerifier', () => {
  let clock: TestClock;
  let verifier: IsolationVerifier;

  beforeEach(() => {
    clock = new TestClock(0);
    verifier = new IsolationVerifier({ clock });
    verifier.registerResource('doc-1', 'tenant-a');
    verifier.registerResource('doc-2', 'tenant-b');
  });

  it('allows same-tenant reads', () => {
    expect(verifier.checkedRead('tenant-a', 'doc-1', true)).toBe(true);
    expect(verifier.leaks().length).toBe(0);
  });

  it('denies cross-tenant reads when data was withheld', () => {
    expect(verifier.checkedRead('tenant-a', 'doc-2', false)).toBe(false);
    expect(verifier.leaks().length).toBe(0);
    expect(verifier.deniedAttempts('tenant-a').length).toBe(1);
  });

  it('records a critical leak when cross-tenant data actually returned', () => {
    const ok = verifier.checkedRead('tenant-a', 'doc-2', true);
    expect(ok).toBe(false); // fail closed
    const leaks = verifier.leaks();
    expect(leaks.length).toBe(1);
    expect(leaks[0]!.actorTenantId).toBe('tenant-a');
    expect(leaks[0]!.ownerTenantId).toBe('tenant-b');
    expect(leaks[0]!.severity).toBe('critical');
    expect(verifier.leaksFor('tenant-b').length).toBe(1);
    expect(verifier.leaksBy('tenant-a').length).toBe(1);
  });

  it('denies unregistered resources in closed-world mode', () => {
    expect(verifier.probe('tenant-a', 'unknown-res')).toBe(false);
    const open = new IsolationVerifier({ clock, allowUnknown: true });
    expect(open.probe('tenant-a', 'unknown-res')).toBe(true);
  });
});

describe('TierManager', () => {
  let clock: TestClock;
  let prov: TenantProvisioner;
  let meter: TenantMeter;
  let tiers: TierManager;

  beforeEach(async () => {
    clock = new TestClock(0);
    prov = new TenantProvisioner(TIERS, makeSteps().steps, clock);
    meter = new TenantMeter(prov, clock);
    tiers = new TierManager(prov, meter, clock);
    await prov.provision('acme', 'free');
  });

  it('upgrades freely', async () => {
    const t = prov.list()[0]!;
    const change = tiers.changeTier(t.id, 'pro', 0);
    expect(change.kind).toBe('upgrade');
    expect(prov.tierOf(t.id).id).toBe('pro');
  });

  it('blocks a downgrade when usage exceeds the target tier', async () => {
    const t = prov.list()[0]!;
    tiers.changeTier(t.id, 'pro', 0);
    meter.record(t.id, 'api-calls', 5000); // > free limit 1000
    try {
      tiers.changeTier(t.id, 'free', 0);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(DowngradeBlockedError);
      expect((e as DowngradeBlockedError).violations[0]!.resource).toBe('api-calls');
    }
    expect(prov.tierOf(t.id).id).toBe('pro');
  });

  it('permits a downgrade when usage fits the smaller tier', async () => {
    const t = prov.list()[0]!;
    tiers.changeTier(t.id, 'pro', 0);
    meter.record(t.id, 'api-calls', 100);
    const change = tiers.changeTier(t.id, 'free', 0);
    expect(change.kind).toBe('downgrade');
    expect(prov.tierOf(t.id).id).toBe('free');
  });

  it('reports headroom per limited resource', async () => {
    const t = prov.list()[0]!;
    meter.record(t.id, 'api-calls', 400);
    const h = tiers.headroom(t.id, 0);
    expect(h['api-calls']).toBe(600);
    expect(h['storage-mb']).toBe(100);
  });
});

describe('CrossTenantAdmin', () => {
  let clock: TestClock;
  let admin: CrossTenantAdmin;

  beforeEach(() => {
    clock = new TestClock(0);
    admin = new CrossTenantAdmin(clock);
  });

  it('grants time-boxed access with a mandatory reason', () => {
    const rec = admin.grant('ops-1', 'tenant-x', 'support', 'INC-1234', 60_000);
    expect(rec.expiresAt).toBe(60_000);
    expect(admin.canAccess('ops-1', 'tenant-x')).toBe(true);
    expect(() => admin.grant('ops-2', 'tenant-x', 'support', '   ', 60_000)).toThrow();
  });

  it('expires grants and removes them lazily', () => {
    admin.grant('ops-1', 'tenant-x', 'support', 'ticket', 60_000);
    clock.advance(60_001);
    expect(admin.canAccess('ops-1', 'tenant-x')).toBe(false);
    expect(admin.activeGrants().length).toBe(0);
  });

  it('records every use and keeps a full audit trail', () => {
    const rec = admin.grant('ops-1', 'tenant-x', 'support', 'ticket', 60_000);
    expect(admin.access('ops-1', 'tenant-x', 'read-user')).toBe(true);
    expect(admin.access('ops-1', 'tenant-y', 'read-user')).toBe(false);
    expect(admin.uses().length).toBe(1);
    expect(admin.uses()[0]!.grantId).toBe(rec.id);
    expect(admin.audit().length).toBe(1);
    expect(admin.grantsFor('tenant-x').length).toBe(1);
    expect(admin.grantsBy('ops-1').length).toBe(1);
  });

  it('revokes grants before expiry', () => {
    admin.grant('ops-1', 'tenant-x', 'support', 'ticket', 60_000);
    expect(admin.revoke('ops-1', 'tenant-x')).toBe(true);
    expect(admin.canAccess('ops-1', 'tenant-x')).toBe(false);
    expect(admin.access('ops-1', 'tenant-x', 'read')).toBe(false);
  });
});
