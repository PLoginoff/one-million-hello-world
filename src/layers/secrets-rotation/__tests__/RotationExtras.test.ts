/**
 * Secrets Rotation extras — unit tests (bun:test)
 */

import { describe, it, expect } from 'bun:test';
import { CronExpression } from '../rotation/CronExpression';
import { SecretVault } from '../rotation/SecretVault';
import { RotationMetrics } from '../rotation/RotationMetrics';
import { RotationEngine } from '../rotation/RotationEngine';
import { RotationScheduler } from '../rotation/RotationScheduler';
import { RotationPolicy } from '../rotation/RotationTypes';

function fakeClock(start = 0): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

const POLICY: RotationPolicy = { secretId: 'svc-key', intervalMs: 60_000, graceMs: 5_000 };

// --------------------------------------------------------------- CronExpression

describe('CronExpression', () => {
  it('parses * and step expressions', () => {
    const every5 = new CronExpression('*/5 * * * *');
    // 2024-01-01 00:00:00Z = 1704067200000; next */5 match = 00:05.
    const next = every5.next(1704067200000)!;
    expect(new Date(next).getUTCMinutes()).toBe(5);
  });

  it('matches specific hour+minute', () => {
    const daily3 = new CronExpression('0 3 * * *');
    // From 2024-01-01 04:00 → next is 2024-01-02 03:00.
    const from = Date.UTC(2024, 0, 1, 4, 0, 0);
    const next = daily3.next(from)!;
    const d = new Date(next);
    expect(d.getUTCHours()).toBe(3);
    expect(d.getUTCMinutes()).toBe(0);
    expect(d.getUTCDate()).toBe(2);
  });

  it('ranges and lists', () => {
    const biz = new CronExpression('0 9-17 * * 1-5');
    // Saturday 10:00 → next Monday 09:00.
    const sat = Date.UTC(2024, 0, 6, 10, 0, 0); // 2024-01-06 is Saturday
    const next = biz.next(sat)!;
    const d = new Date(next);
    expect(d.getUTCDay()).toBe(1); // Monday
    expect(d.getUTCHours()).toBe(9);
  });

  it('dom/dow OR semantics when both restricted', () => {
    const c = new CronExpression('0 0 1 * 0');
    // Matches the 1st of month OR Sundays.
    const first = Date.UTC(2024, 1, 1, 0, 0, 0); // Feb 1 2024 (Thursday)
    expect(c.matches(first)).toBe(true);
    const sunday = Date.UTC(2024, 1, 4, 0, 0, 0); // Feb 4 2024 = Sunday
    expect(c.matches(sunday)).toBe(true);
    const other = Date.UTC(2024, 1, 5, 0, 0, 0); // Feb 5 Monday
    expect(c.matches(other)).toBe(false);
  });

  it('rejects malformed expressions', () => {
    expect(() => new CronExpression('* * *')).toThrow(SyntaxError);
    expect(() => new CronExpression('61 * * * *')).toThrow(RangeError);
    expect(() => new CronExpression('x y z a b')).toThrow();
  });

  it('nextN previews a schedule', () => {
    const c = new CronExpression('0 0 * * *');
    const next3 = c.nextN(Date.UTC(2024, 0, 1), 3);
    expect(next3.length).toBe(3);
    expect(new Date(next3[0]).getUTCDate()).toBe(2);
    expect(new Date(next3[2]).getUTCDate()).toBe(4);
  });
});

// ------------------------------------------------------------------ SecretVault

describe('SecretVault', () => {
  function vaultWithKey() {
    const clk = fakeClock();
    const engine = new RotationEngine(
      clk.now,
      (s, g) => new Uint8Array([g, 0xab, 0xcd]),
      new RotationScheduler(clk.now, () => 0.5, 0)
    );
    engine.register(POLICY);
    const vault = new SecretVault(engine, clk.now, () => 0.42);
    vault.registerMasterKey(engine.activeKey('svc-key')!.material.keyId, new Uint8Array([1, 0xab, 0xcd]));
    return { vault, engine, clk };
  }

  it('encrypts and decrypts a value end-to-end', () => {
    const { vault } = vaultWithKey();
    vault.put('svc-key', 'super-secret');
    expect(vault.get('svc-key')).toBe('super-secret');
  });

  it('value survives master-key rotation after rewrap', () => {
    const { vault, engine } = vaultWithKey();
    vault.put('svc-key', 'top-secret');
    // Rotate master → new active key.
    engine.rotate('svc-key', 'test');
    vault.registerMasterKey(engine.activeKey('svc-key')!.material.keyId, new Uint8Array([2, 0xab, 0xcd]));
    const { rewrapped } = vault.rewrapAll();
    expect(rewrapped).toBe(1);
    expect(vault.get('svc-key')).toBe('top-secret');
  });

  it('get fails closed when the wrapping master key is revoked', () => {
    const { vault, engine } = vaultWithKey();
    vault.put('svc-key', 'secret');
    engine.emergencyRotate('svc-key', 'leak');
    // Old master key is REVOKED — the wrapped DEK can't be trusted.
    expect(vault.get('svc-key')).toBeNull();
  });

  it('stores wrapped DEK under the then-active masterKeyId', () => {
    const { vault, engine } = vaultWithKey();
    const rec = vault.put('svc-key', 'x');
    expect(rec.masterKeyId).toBe(engine.activeKey('svc-key')!.material.keyId);
  });
});

// -------------------------------------------------------------- RotationMetrics

describe('RotationMetrics', () => {
  it('aggregates rotation KPIs from audit entries', () => {
    const m = new RotationMetrics();
    const mk = (event: 'activated' | 'retiring' | 'revoked' | 'emergency-rotated' | 'scheduled-fired', at = 0) =>
      m.onAudit({ seq: 0, at, secretId: 's', keyId: 'k', generation: 1, event, reason: '', actor: 't' });
    mk('activated', 0);
    mk('scheduled-fired');
    mk('retiring');
    mk('activated', 100);
    mk('emergency-rotated');
    mk('revoked');
    const s = m.snapshot();
    expect(s.rotationsTotal).toBe(2);
    expect(s.emergencyRotations).toBe(1);
    expect(s.scheduledRotations).toBe(1);
    expect(s.revocations).toBe(1);
    expect(s.emergencyRate).toBe(0.5);
    expect(s.meanRotationIntervalMs).toBe(100);
  });

  it('rotationLatency reports observed durations', () => {
    const m = new RotationMetrics();
    m.recordRotationLatency(10);
    m.recordRotationLatency(30);
    expect(m.rotationLatency().mean).toBe(20);
    expect(m.rotationLatency().max).toBe(30);
  });

  it('overdueSecrets flags secrets past their interval', () => {
    const clk = fakeClock(0);
    const m = new RotationMetrics(clk.now);
    m.onAudit({ seq: 0, at: 0, secretId: 's', keyId: 'k', generation: 1, event: 'activated', reason: '', actor: 't' });
    clk.advance(200_000);
    const intervals = new Map([['s', 100_000]]);
    const overdue = m.overdueSecrets(intervals);
    expect(overdue[0].secretId).toBe('s');
    expect(overdue[0].overdueMs).toBe(100_000);
  });
});
