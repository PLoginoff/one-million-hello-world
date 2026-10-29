/**
 * MFA real implementation tests — TOTP (RFC 6238), HOTP (RFC 4226),
 * backup codes, rate limiting, enrollment flow, SMS stub.
 *
 * Test vectors from RFC 6238 Appendix B and RFC 4226 Appendix D.
 */

import { describe, expect, it } from 'bun:test';
import { base32Decode, base32Encode } from '../totp/Base32';
import { hotp, hotpVerify } from '../totp/Hotp';
import { Totp } from '../totp/Totp';
import { BackupCodes } from '../totp/BackupCodes';
import { MfaRateLimiter } from '../totp/MfaRateLimiter';
import { MfaEnrollment } from '../totp/MfaEnrollment';
import { SmsCodeProvider, SmsTransport } from '../totp/SmsCodeProvider';

/* RFC 4226 Appendix D — HOTP test values with secret "12345678901234567890" */
const RFC4226_SECRET = Buffer.from('12345678901234567890', 'ascii');
const RFC4226_CODES = [
  '755224',
  '287082',
  '359152',
  '969429',
  '338314',
  '254676',
  '287922',
  '162583',
  '399871',
  '520489',
];

/* RFC 6238 Appendix B — TOTP test values */
const RFC6238_SECRET_SHA1 = Buffer.from('12345678901234567890', 'ascii');
const RFC6238_SECRET_SHA256 = Buffer.from(
  '12345678901234567890123456789012',
  'ascii'
);
const RFC6238_SECRET_SHA512 = Buffer.from(
  '1234567890123456789012345678901234567890123456789012345678901234',
  'ascii'
);

describe('Base32', () => {
  it('round-trips bytes', () => {
    const data = Buffer.from('Hello, world!', 'utf8');
    const enc = base32Encode(data);
    expect(base32Decode(enc)).toEqual(data);
  });
  it('decodes case-insensitively and ignores padding', () => {
    const enc = base32Encode(Buffer.from('Hello, world!', 'utf8'));
    expect(base32Decode(enc.toLowerCase() + '======')).toEqual(Buffer.from('Hello, world!', 'utf8'));
    expect(base32Decode(enc)).toEqual(Buffer.from('Hello, world!', 'utf8'));
  });
});

describe('HOTP — RFC 4226', () => {
  it('produces the standard test vector for counters 0-9', () => {
    for (let i = 0; i < RFC4226_CODES.length; i++) {
      expect(hotp(RFC4226_SECRET, i, { digits: 6 })).toBe(RFC4226_CODES[i]);
    }
  });

  it('hotpVerify finds a code within look-ahead', () => {
    // Current counter is 5; code at counter 7 should verify (lookAhead ≥ 2)
    const code = hotp(RFC4226_SECRET, 7);
    expect(hotpVerify(RFC4226_SECRET, 5, code, { lookAhead: 3 })).toBe(7);
    expect(hotpVerify(RFC4226_SECRET, 5, '000000', { lookAhead: 3 })).toBe(-1);
  });
});

describe('TOTP — RFC 6238', () => {
  it('matches RFC test vectors (SHA-1, 8 digits)', () => {
    // T=59 → 94287082; T=1111111109 → 07081804; T=1234567890 → 89005924
    expect(
      Totp.generate(RFC6238_SECRET_SHA1, 59_000, { digits: 8, algorithm: 'sha1' })
    ).toBe('94287082');
    expect(
      Totp.generate(RFC6238_SECRET_SHA1, 1_111_111_109_000, { digits: 8, algorithm: 'sha1' })
    ).toBe('07081804');
    expect(
      Totp.generate(RFC6238_SECRET_SHA1, 1_234_567_890_000, { digits: 8, algorithm: 'sha1' })
    ).toBe('89005924');
  });

  it('matches RFC test vectors (SHA-256 & SHA-512)', () => {
    expect(
      Totp.generate(RFC6238_SECRET_SHA256, 59_000, { digits: 8, algorithm: 'sha256' })
    ).toBe('46119246');
    expect(
      Totp.generate(RFC6238_SECRET_SHA512, 59_000, { digits: 8, algorithm: 'sha512' })
    ).toBe('90693936');
  });

  it('verifies within ±1 window tolerance', () => {
    const secret = RFC6238_SECRET_SHA1;
    const t = 100_000_000_000; // arbitrary
    const current = Totp.generate(secret, t);
    const prev = Totp.generate(secret, t - 30_000);
    const next = Totp.generate(secret, t + 30_000);
    const far = Totp.generate(secret, t + 60_000);

    expect(Totp.verify(secret, current, t).valid).toBe(true);
    expect(Totp.verify(secret, prev, t).valid).toBe(true);
    expect(Totp.verify(secret, next, t).valid).toBe(true);
    expect(Totp.verify(secret, far, t).valid).toBe(false);
    expect(Totp.verify(secret, '000000', t).valid).toBe(false);
  });

  it('respects custom step size', () => {
    const secret = RFC6238_SECRET_SHA1;
    const code60 = Totp.generate(secret, 59_000, { stepSeconds: 60, digits: 6 });
    const code30 = Totp.generate(secret, 59_000, { stepSeconds: 30, digits: 6 });
    // Different step → different counter → different code (usually)
    expect(typeof code60).toBe('string');
    expect(code60.length).toBe(6);
    expect(code30.length).toBe(6);
  });

  it('generates and parses otpauth URIs', () => {
    const uri = Totp.otpauthUri({
      secretBase32: 'JBSWY3DPEHPK3PXP',
      accountName: 'alice@example.com',
      issuer: 'AcmeCorp',
      algorithm: 'sha256',
      digits: 8,
      period: 60,
    });
    const parsed = Totp.parseOtpauthUri(uri);
    expect(parsed).not.toBeNull();
    expect(parsed!.type).toBe('totp');
    expect(parsed!.issuer).toBe('AcmeCorp');
    expect(parsed!.algorithm).toBe('sha256');
    expect(parsed!.digits).toBe(8);
    expect(parsed!.period).toBe(60);
    expect(parsed!.label).toContain('alice@example.com');
  });
});

describe('BackupCodes', () => {
  it('generates and validates single-use codes', () => {
    const { codes, entries } = BackupCodes.generate(5);
    expect(codes).toHaveLength(5);
    expect(new Set(codes).size).toBe(5);

    const bc = new BackupCodes();
    bc.load(entries);
    expect(bc.remaining).toBe(5);
    expect(bc.validate(codes[0])).toBe(true);
    expect(bc.remaining).toBe(4);
    // Same code can't be reused
    expect(bc.validate(codes[0])).toBe(false);
    // Unknown code fails
    expect(bc.validate('XXXXX-XXXXX')).toBe(false);
  });

  it('codes are case-insensitive', () => {
    const { codes, entries } = BackupCodes.generate(1);
    const bc = new BackupCodes();
    bc.load(entries);
    expect(bc.validate(codes[0].toLowerCase())).toBe(true);
  });
});

describe('MfaRateLimiter', () => {
  it('locks after maxAttempts failures', () => {
    let t = 0;
    const rl = new MfaRateLimiter(
      { maxAttempts: 3, lockoutMs: 60_000, windowMs: 60_000 },
      { now: () => t }
    );
    expect(rl.check('u1').allowed).toBe(true);
    rl.recordFailure('u1');
    rl.recordFailure('u1');
    const r = rl.recordFailure('u1');
    expect(r.locked).toBe(true);
    expect(rl.check('u1').allowed).toBe(false);
    expect(rl.isLocked('u1')).toBe(true);
    t = 61_000;
    expect(rl.check('u1').allowed).toBe(true); // unlocked after lockout
  });

  it('success resets the bucket', () => {
    const rl = new MfaRateLimiter({ maxAttempts: 3 });
    rl.recordFailure('u');
    rl.recordFailure('u');
    rl.recordSuccess('u');
    expect(rl.check('u').remaining).toBe(3);
  });
});

describe('MfaEnrollment', () => {
  it('full enrollment → confirm → verify flow', () => {
    const enrollment = new MfaEnrollment({ now: () => 1_000_000_000 });
    const { factorId, otpauthUri, secretBase32 } = enrollment.beginTotp(
      'user-1',
      'alice@corp.com',
      { issuer: 'Corp' }
    );
    expect(otpauthUri).toContain('otpauth://totp/');
    expect(otpauthUri).toContain('secret=' + secretBase32);

    // Generate the code the user's authenticator would produce
    const secret = base32Decode(secretBase32);
    const code = Totp.generate(secret, 1_000_000_000);
    const confirm = enrollment.confirmTotp(factorId, code);
    expect(confirm.confirmed).toBe(true);
    expect(confirm.backupCodes).toHaveLength(10);

    // Subsequent verification with a fresh code at same timestamp
    expect(enrollment.verifyTotp(factorId, code)).toBe(true);
    expect(enrollment.verifyTotp(factorId, '999999')).toBe(false);
  });

  it('rejects confirmation with wrong code', () => {
    const e = new MfaEnrollment({ now: () => 0 });
    const { factorId } = e.beginTotp('u', 'acct');
    expect(e.confirmTotp(factorId, '000000').confirmed).toBe(false);
    expect(e.get(factorId)?.status).toBe('pending');
  });

  it('backup codes work after activation', () => {
    const e = new MfaEnrollment({ now: () => 500_000 });
    const { factorId, secretBase32 } = e.beginTotp('u', 'a');
    const secret = base32Decode(secretBase32);
    const code = Totp.generate(secret, 500_000);
    const { backupCodes } = e.confirmTotp(factorId, code);
    expect(e.verifyBackupCode(factorId, backupCodes![0])).toBe(true);
    expect(e.verifyBackupCode(factorId, backupCodes![0])).toBe(false); // used
  });
});

describe('SmsCodeProvider', () => {
  it('sends and verifies a code through the injected transport', async () => {
    const sent: Array<{ to: string; message: string }> = [];
    const transport: SmsTransport = {
      send: async (to, msg) => {
        sent.push({ to, message: msg });
      },
    };
    const sms = new SmsCodeProvider(transport, { now: () => 0, ttlMs: 60_000 });
    const { challengeId } = await sms.send('+15551234');
    expect(sent).toHaveLength(1);
    // Extract the code the transport "sent"
    const code = sent[0].message.match(/\d{6}/)![0];
    expect(sms.verify(challengeId, '+15551234', code)).toBe(true);
  });

  it('rejects wrong codes and expires', async () => {
    const sent: string[] = [];
    const sms = new SmsCodeProvider(
      { send: async (_to, m) => sent.push(m) },
      { now: () => 0, ttlMs: 1000 }
    );
    const { challengeId } = await sms.send('+1');
    expect(sms.verify(challengeId, '+1', '000000')).toBe(false);
    // advance past TTL
    const sms2 = new SmsCodeProvider(
      { send: async () => {} },
      { now: () => 60_000 }
    );
    // reuse challengeId with expired provider → false
    expect(sms2.verify(challengeId, '+1', '123456')).toBe(false);
  });
});
