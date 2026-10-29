/**
 * Secrets Rotation engine — unit tests (bun:test)
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { KeyState, RotationPolicy } from '../rotation/RotationTypes';
import { KeyRing, InvalidKeyTransition } from '../rotation/KeyRing';
import { AuditTrail } from '../rotation/AuditTrail';
import { RotationScheduler } from '../rotation/RotationScheduler';
import { RotationEngine } from '../rotation/RotationEngine';

function fakeClock(start = 1_000_000): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

function keyMaterial(id: string, secretId: string, gen: number) {
  return {
    keyId: id,
    secretId,
    generation: gen,
    material: new Uint8Array([gen, gen + 1, gen + 2]),
    fingerprint: `fp-${gen}`,
  };
}

const POLICY: RotationPolicy = {
  secretId: 'db-password',
  intervalMs: 60_000,
  graceMs: 5_000,
  autoRevokeOnGraceEnd: true,
};

// ---------------------------------------------------------------------- KeyRing

describe('KeyRing', () => {
  it('enforces lifecycle transition guards', () => {
    const ring = new KeyRing('s');
    ring.add(keyMaterial('k1', 's', 1));
    expect(() => ring.transition('k1', KeyState.ACTIVE)).toThrow(InvalidKeyTransition); // must stage first
    ring.transition('k1', KeyState.STAGING);
    ring.transition('k1', KeyState.ACTIVE);
    expect(ring.active()?.material.keyId).toBe('k1');
    expect(() => ring.transition('k1', KeyState.STAGING)).toThrow(InvalidKeyTransition);
  });

  it('enforces single-ACTIVE invariant', () => {
    const ring = new KeyRing('s');
    ring.add(keyMaterial('k1', 's', 1));
    ring.add(keyMaterial('k2', 's', 2));
    ring.transition('k1', KeyState.STAGING);
    ring.transition('k1', KeyState.ACTIVE);
    ring.transition('k2', KeyState.STAGING);
    expect(() => ring.transition('k2', KeyState.ACTIVE)).toThrow(/already ACTIVE/);
  });

  it('rejects non-monotonic generations', () => {
    const ring = new KeyRing('s');
    ring.add(keyMaterial('k1', 's', 5));
    expect(() => ring.add(keyMaterial('k2', 's', 4))).toThrow(RangeError);
    expect(() => ring.add(keyMaterial('k3', 's', 5))).toThrow(RangeError);
  });

  it('dual-key validity: RETIRING inside grace validates, outside does not', () => {
    const clk = fakeClock();
    const ring = new KeyRing('s', clk.now);
    ring.add(keyMaterial('k1', 's', 1));
    ring.transition('k1', KeyState.STAGING);
    ring.transition('k1', KeyState.ACTIVE);
    ring.transition('k1', KeyState.RETIRING, { graceMs: 1000 });
    expect(ring.validate('k1').valid).toBe(true);
    expect(ring.validate('k1').reason).toContain('grace');
    clk.advance(1500);
    const v = ring.validate('k1');
    expect(v.valid).toBe(false);
    expect(v.reason).toContain('expired');
  });

  it('RETIRING validates but cannot operate (no new signatures)', () => {
    const ring = new KeyRing('s');
    ring.add(keyMaterial('k1', 's', 1));
    ring.transition('k1', KeyState.STAGING);
    ring.transition('k1', KeyState.ACTIVE);
    expect(ring.canOperate('k1')).toBe(true);
    ring.transition('k1', KeyState.RETIRING, { graceMs: 1000 });
    expect(ring.validate('k1').valid).toBe(true); // verify ok
    expect(ring.canOperate('k1')).toBe(false); // but no new ops
  });

  it('REVOKED never validates — no grace', () => {
    const ring = new KeyRing('s');
    ring.add(keyMaterial('k1', 's', 1));
    ring.transition('k1', KeyState.STAGING);
    ring.transition('k1', KeyState.ACTIVE);
    ring.transition('k1', KeyState.REVOKED, { reason: 'leaked' });
    const v = ring.validate('k1');
    expect(v.valid).toBe(false);
    expect(v.reason).toContain('revoked');
  });
});

// ------------------------------------------------------------------- AuditTrail

describe('AuditTrail', () => {
  it('records entries with increasing seq and per-secret views', () => {
    const clk = fakeClock();
    const t = new AuditTrail(clk.now);
    t.append('s1', 'k1', 1, 'generated', 'r', 'a');
    t.append('s1', 'k1', 1, 'activated', 'r', 'a');
    t.append('s2', 'k9', 1, 'generated', 'r', 'a');
    expect(t.length).toBe(3);
    expect(t.forSecret('s1').length).toBe(2);
    expect(t.byEvent('activated').length).toBe(1);
  });

  it('hash chain verifies intact and detects tampering', () => {
    const t = new AuditTrail();
    for (let i = 0; i < 5; i++) t.append('s', `k${i}`, i, 'generated', 'x', 'a');
    expect(t.verifyIntegrity().intact).toBe(true);
    // Tamper with an internal entry's reason.
    const entries = t.all();
    void entries;
    // Access internals via re-append — simplest tamper path is a fresh trail
    // with a mutated internal entry, which we simulate via bracket access.
    const internals = t as unknown as { _entries: { entry: { reason: string } }[] };
    internals._entries[2].entry.reason = 'FORGED';
    expect(t.verifyIntegrity().intact).toBe(false);
    expect(t.verifyIntegrity().firstBrokenIndex).toBe(2);
  });
});

// ------------------------------------------------------------- RotationScheduler

describe('RotationScheduler', () => {
  it('fires due rotations and auto-reschedules', () => {
    const clk = fakeClock(0);
    const s = new RotationScheduler(clk.now, () => 0.5, 0); // no jitter
    s.register({ secretId: 'a', intervalMs: 1000, graceMs: 0 });
    s.register({ secretId: 'b', intervalMs: 500, graceMs: 0 });
    clk.advance(600);
    const due1 = s.due();
    expect(due1.map((d) => d.secretId)).toEqual(['b']);
    clk.advance(500); // t=1100 → 'a' due AND 'b' due again
    const due2 = s.due();
    expect(due2.map((d) => d.secretId).sort()).toEqual(['a', 'b']);
  });

  it('auto-reschedules from due time to keep cadence', () => {
    const clk = fakeClock(0);
    const s = new RotationScheduler(clk.now, () => 0.5, 0);
    s.register({ secretId: 'a', intervalMs: 1000, graceMs: 0 });
    clk.advance(1000);
    s.due();
    expect(s.nextDueFor('a')).toBe(2000); // 1000 + 1000, not 1000+skew
  });

  it('peekNext returns soonest due without consuming', () => {
    const clk = fakeClock(0);
    const s = new RotationScheduler(clk.now, () => 0.5, 0);
    s.register({ secretId: 'far', intervalMs: 5000, graceMs: 0 });
    s.register({ secretId: 'near', intervalMs: 100, graceMs: 0 });
    expect(s.peekNext()?.secretId).toBe('near');
    expect(s.size).toBe(2);
  });

  it('jitter spreads next-due around the interval', () => {
    const clk = fakeClock(0);
    // Random sequence cycling 0 and 1 → ±10% jitter extremes.
    let i = 0;
    const s = new RotationScheduler(clk.now, () => (i++ % 2 === 0 ? 0 : 1), 0.1);
    s.register({ secretId: 'lo', intervalMs: 1000, graceMs: 0 });
    s.register({ secretId: 'hi', intervalMs: 1000, graceMs: 0 });
    expect(s.nextDueFor('lo')).toBe(900);
    expect(s.nextDueFor('hi')).toBe(1100);
  });

  it('unregister removes from schedule', () => {
    const s = new RotationScheduler(fakeClock().now, () => 0.5, 0);
    s.register({ secretId: 'a', intervalMs: 100, graceMs: 0 });
    expect(s.unregister('a')).toBe(true);
    expect(s.size).toBe(0);
    expect(s.due()).toEqual([]);
  });
});

// ---------------------------------------------------------------- RotationEngine

describe('RotationEngine', () => {
  let clk: ReturnType<typeof fakeClock>;
  let engine: RotationEngine;

  beforeEach(() => {
    clk = fakeClock();
    engine = new RotationEngine(
      clk.now,
      (secretId, gen) => new Uint8Array([gen, 0xaa, 0xbb]),
      new RotationScheduler(clk.now, () => 0.5, 0) // deterministic, no jitter
    );
    engine.register(POLICY);
  });

  it('register seeds an ACTIVE key', () => {
    const active = engine.activeKey('db-password');
    expect(active).toBeDefined();
    expect(active?.state).toBe(KeyState.ACTIVE);
    expect(active?.material.generation).toBe(1);
  });

  it('rotate produces dual-key window: old verifies during grace', () => {
    const old = engine.activeKey('db-password')!.material.keyId;
    const res = engine.rotate('db-password', 'test');
    expect(res.newGeneration).toBe(2);
    expect(res.retiredKeyId).toBe(old);
    expect(res.dualKeyWindowEndsAt).toBe(clk.now() + POLICY.graceMs);
    // Old key: valid for verify (grace) but not for new ops.
    expect(engine.validate('db-password', old).valid).toBe(true);
    expect(engine.ringFor('db-password').canOperate(old)).toBe(false);
    // New key is the only ACTIVE.
    expect(engine.activeKey('db-password')?.material.keyId).toBe(res.newKeyId);
  });

  it('grace expiry auto-revokes the retiring key on sweep', () => {
    const old = engine.activeKey('db-password')!.material.keyId;
    engine.rotate('db-password', 'test');
    clk.advance(POLICY.graceMs + 1);
    const { expired } = engine.sweep();
    expect(expired).toContain(old);
    expect(engine.validate('db-password', old).valid).toBe(false);
    expect(engine.ringFor('db-password').get(old)?.state).toBe(KeyState.REVOKED);
  });

  it('scheduled sweep rotates when the interval fires', () => {
    clk.advance(POLICY.intervalMs + 1);
    const { rotated } = engine.sweep();
    expect(rotated.length).toBe(1);
    expect(rotated[0].newGeneration).toBe(2);
  });

  it('emergency rotation revokes active key with NO grace', () => {
    const compromised = engine.activeKey('db-password')!.material.keyId;
    const res = engine.emergencyRotate('db-password', 'key leaked to log', 'secops');
    expect(res.emergency).toBe(true);
    expect(engine.validate('db-password', compromised).valid).toBe(false);
    expect(engine.ringFor('db-password').get(compromised)?.state).toBe(KeyState.REVOKED);
    expect(engine.activeKey('db-password')?.material.keyId).toBe(res.newKeyId);
    // Audit shows both the revocation and the emergency-rotated event.
    const audit = engine.auditFor('db-password');
    expect(audit.some((e) => e.event === 'revoked' && e.reason === 'key leaked to log')).toBe(true);
    expect(audit.some((e) => e.event === 'emergency-rotated')).toBe(true);
  });

  it('maxKeyAge forces rotation independent of interval', () => {
    const e2 = new RotationEngine(
      clk.now,
      (s, g) => new Uint8Array([g]),
      new RotationScheduler(clk.now, () => 0.5, 0)
    );
    e2.register({ secretId: 'short', intervalMs: 1_000_000, graceMs: 0, maxKeyAgeMs: 100 });
    clk.advance(150);
    const { maxAgeRotated } = e2.sweep();
    expect(maxAgeRotated.length).toBe(1);
    expect(e2.activeKey('short')?.material.generation).toBe(2);
  });

  it('manual revoke invalidates a specific generation', () => {
    const k = engine.activeKey('db-password')!.material.keyId;
    engine.revoke('db-password', k, 'suspect');
    expect(engine.validate('db-password', k).valid).toBe(false);
  });

  it('retireNow ends a grace window early', () => {
    const old = engine.activeKey('db-password')!.material.keyId;
    engine.rotate('db-password', 'test');
    engine.retireNow('db-password', old);
    expect(engine.validate('db-password', old).valid).toBe(false);
    expect(engine.ringFor('db-password').get(old)?.state).toBe(KeyState.RETIRED);
  });

  it('audit trail covers the full lifecycle', () => {
    engine.rotate('db-password', 'test');
    const events = engine.auditFor('db-password').map((e) => e.event);
    expect(events).toContain('generated');
    expect(events).toContain('staged');
    expect(events).toContain('activated');
    expect(events).toContain('retiring');
    expect(engine.audit.verifyIntegrity().intact).toBe(true);
  });

  it('rejects unregistered secrets', () => {
    expect(() => engine.rotate('ghost')).toThrow(/not registered/);
    expect(() => engine.validate('ghost', 'k')).toThrow(/not registered/);
  });
});
