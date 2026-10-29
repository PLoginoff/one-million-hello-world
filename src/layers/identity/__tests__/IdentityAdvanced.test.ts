/**
 * Identity advanced tests — TOTP engine, audit log integrity chain.
 */

import { describe, it, expect } from 'bun:test';
import { TotpEngine, base32Encode, base32Decode } from '../core/TotpEngine';
import { IdentityAuditLog, AuditEventKind } from '../core/IdentityAuditLog';

describe('TotpEngine', () => {
  const totp = new TotpEngine();

  it('base32 round-trips', () => {
    const secret = totp.generateSecret();
    const decoded = base32Decode(secret);
    expect(base32Encode(decoded)).toBe(secret);
    expect(decoded.length).toBe(20);
  });

  it('generates RFC-consistent codes for known counter values', () => {
    // RFC 4226 test vector uses secret "12345678901234567890" (ASCII) at
    // step T=59 (counter 1) -> HOTP sha1 = 94287082 -> 6-digit 287082.
    const secret = base32Encode(Buffer.from('12345678901234567890', 'ascii'));
    const t = new TotpEngine({ stepSeconds: 30, digits: 6 });
    const code = t.totp(secret, 59_000); // counter 1
    expect(code).toBe('287082');
  });

  it('verifies within drift window and rejects replay of same step', () => {
    const secret = totp.generateSecret();
    const now = 1_000_000 * 30_000; // aligned to step boundary
    const code = totp.totp(secret, now);
    const step = totp.verify(secret, code, now);
    expect(step).toBeGreaterThanOrEqual(0);
    // Same code, same step -> rejected when lastAcceptedStep = step
    expect(totp.verify(secret, code, now, step)).toBe(-1);
    // Wrong code rejected
    expect(totp.verify(secret, code === '000000' ? '111111' : '000000', now)).toBe(-1);
  });

  it('tolerates ±1 step drift by default', () => {
    const secret = totp.generateSecret();
    const now = 5_000_000 * 30;
    const prevStepCode = totp.totp(secret, now - 30_000);
    expect(totp.verify(secret, prevStepCode, now)).toBeGreaterThanOrEqual(0);
  });

  it('emits otpauth URIs', () => {
    const uri = totp.otpauthUri('JBSWY3DPEHPK3PXP', 'alice@x.com', 'Corp');
    expect(uri.startsWith('otpauth://totp/Corp:alice%40x.com')).toBe(true);
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
  });
});

describe('IdentityAuditLog', () => {
  it('records and queries events', () => {
    const log = new IdentityAuditLog();
    log.record(AuditEventKind.REGISTER, { userId: 'u1' });
    log.record(AuditEventKind.LOGIN_SUCCESS, { userId: 'u1' });
    log.record(AuditEventKind.LOGIN_FAILURE, { userId: 'u2' });
    expect(log.query({ userId: 'u1' })).toHaveLength(2);
    expect(log.query({ kind: AuditEventKind.LOGIN_FAILURE })).toHaveLength(1);
    expect(log.verify()).toBe(-1);
  });

  it('detects tampering via hash chain', () => {
    const log = new IdentityAuditLog();
    log.record(AuditEventKind.REGISTER, { userId: 'u1' });
    const e2 = log.record(AuditEventKind.LOGIN_SUCCESS, { userId: 'u1' });
    log.record(AuditEventKind.LOGOUT, { userId: 'u1' });
    // Tamper with the middle entry's recorded detail
    (e2 as { userId?: string }).userId = 'attacker';
    expect(log.verify()).toBe(e2.seq);
  });

  it('evicts beyond capacity but keeps chain anchor', () => {
    const log = new IdentityAuditLog(3);
    for (let i = 0; i < 5; i++) log.record(AuditEventKind.LOGIN_SUCCESS, { userId: `u${i}` });
    expect(log.size()).toBe(3);
    expect(log.droppedCount()).toBe(2);
    expect(log.verify()).toBe(-1); // window still verifies against anchor
  });
});
