/**
 * Real encryption tests — AES-256-GCM, KDFs, key rotation, envelope
 * encryption, field-level encryption, secure random.
 */

import { describe, expect, it } from 'bun:test';
import { randomBytes } from 'crypto';
import { AesGcm } from '../crypto/AesGcm';
import { Kdf } from '../crypto/Kdf';
import { KeyRing } from '../crypto/KeyRing';
import { FieldEncryptor } from '../crypto/FieldEncryptor';
import { SecureRandom } from '../crypto/SecureRandom';
import { CryptoError, EncryptedEnvelope, isEncryptedEnvelope } from '../crypto/types';

const KEY = randomBytes(32);

describe('AesGcm', () => {
  it('encrypts and decrypts round-trip', () => {
    const env = AesGcm.encrypt(KEY, 'hello world', { kid: 'k1' });
    expect(env.alg).toBe('A256GCM');
    expect(env.iv).toBeDefined();
    expect(env.ct).toBeDefined();
    expect(env.kid).toBe('k1');
    const pt = AesGcm.decrypt(KEY, env);
    expect(pt.toString()).toBe('hello world');
  });

  it('fails with wrong key', () => {
    const env = AesGcm.encrypt(KEY, 'secret');
    const otherKey = randomBytes(32);
    expect(() => AesGcm.decrypt(otherKey, env)).toThrow(CryptoError);
  });

  it('detects ciphertext tampering (GCM tag)', () => {
    const env = AesGcm.encrypt(KEY, 'data');
    const ct = Buffer.from(env.ct, 'base64');
    ct[0] ^= 0xff;
    const tampered: EncryptedEnvelope = { ...env, ct: ct.toString('base64') };
    expect(() => AesGcm.decrypt(KEY, tampered)).toThrow(CryptoError);
  });

  it('detects IV tampering', () => {
    const env = AesGcm.encrypt(KEY, 'x');
    const badIv = Buffer.from(env.iv, 'base64');
    badIv[0] ^= 1;
    expect(() => AesGcm.decrypt(KEY, { ...env, iv: badIv.toString('base64') })).toThrow(
      CryptoError
    );
  });

  it('binds AAD into the tag', () => {
    const env = AesGcm.encrypt(KEY, 'ctx', { aad: 'tenant-1' });
    // correct aad decrypts
    expect(AesGcm.decryptToString(KEY, env, { aad: 'tenant-1' })).toBe('ctx');
    // wrong aad fails
    expect(() => AesGcm.decrypt(KEY, env, { aad: 'tenant-2' })).toThrow(CryptoError);
    // missing aad fails
    expect(() => AesGcm.decrypt(KEY, env)).toThrow(CryptoError);
  });

  it('rejects non-32-byte keys', () => {
    expect(() => AesGcm.encrypt(randomBytes(16), 'x')).toThrow(CryptoError);
  });

  it('isEncryptedEnvelope type-guard works', () => {
    const env = AesGcm.encrypt(KEY, 'x');
    expect(isEncryptedEnvelope(env)).toBe(true);
    expect(isEncryptedEnvelope({ v: 1, alg: 'A256GCM' })).toBe(false);
    expect(isEncryptedEnvelope('nope')).toBe(false);
  });
});

describe('Kdf', () => {
  it('derives the same PBKDF2 key from same inputs', () => {
    const salt = Kdf.generateSalt();
    const r1 = Kdf.derive('password', { algorithm: 'pbkdf2-sha256', salt, iterations: 100_000 });
    const r2 = Kdf.derive('password', { algorithm: 'pbkdf2-sha256', salt, iterations: 100_000 });
    expect(r1.key.equals(r2.key)).toBe(true);
    expect(r1.key.length).toBe(32);
  });

  it('rejects weak PBKDF2 iterations', () => {
    expect(() =>
      Kdf.derive('pw', { algorithm: 'pbkdf2-sha256', iterations: 100 })
    ).toThrow(CryptoError);
  });

  it('derives scrypt keys', () => {
    const salt = Kdf.generateSalt();
    const r = Kdf.derive('pw', { algorithm: 'scrypt', salt, scryptN: 16384 });
    expect(r.key.length).toBe(32);
    // Verification
    expect(Kdf.verify('pw', r.key, r.params, salt)).toBe(true);
    expect(Kdf.verify('wrong', r.key, r.params, salt)).toBe(false);
  });

  it('HKDF produces domain-separated keys', () => {
    const ikm = randomBytes(32);
    const a = Kdf.derive(ikm, { algorithm: 'hkdf-sha256', salt: Buffer.alloc(0), hkdfInfo: 'encryption' });
    const b = Kdf.derive(ikm, { algorithm: 'hkdf-sha256', salt: Buffer.alloc(0), hkdfInfo: 'signing' });
    expect(a.key.equals(b.key)).toBe(false);
    expect(a.key.length).toBe(32);
  });

  it('argon2id stub respects parameters', () => {
    const r = Kdf.derive('pw', {
      algorithm: 'argon2id-stub',
      argon2MemoryKiB: 19 * 1024,
      argon2Iterations: 2,
    });
    expect(r.key.length).toBe(32);
    expect(r.params.argon2MemoryKiB).toBe(19 * 1024);
  });

  it('argon2id stub rejects weak memory', () => {
    expect(() =>
      Kdf.derive('pw', { algorithm: 'argon2id-stub', argon2MemoryKiB: 1024 })
    ).toThrow(CryptoError);
  });
});

describe('KeyRing (envelope encryption)', () => {
  it('seals and opens records end-to-end', () => {
    const ring = new KeyRing();
    const rec = ring.seal('sensitive payload', { aad: 'ctx' });
    expect(rec.data.ct).toBeDefined();
    expect(rec.wrappedDek.kid).toBeDefined();
    const pt = ring.open(rec, { aad: 'ctx' });
    expect(pt.toString()).toBe('sensitive payload');
  });

  it('rotates KEK and rewraps', () => {
    const ring = new KeyRing();
    const rec = ring.seal('data');
    const oldKid = rec.kekKid;
    ring.rotateKek();
    const rewrapped = ring.rewrap(rec);
    expect(rewrapped.kekKid).not.toBe(oldKid);
    // Old record still decrypts (retired KEK is kept)
    expect(ring.open(rec).toString()).toBe('data');
    // And the rewrapped record decrypts under the new KEK
    expect(ring.open(rewrapped).toString()).toBe('data');
  });

  it('fails to open when KEK is unknown', () => {
    const ring1 = new KeyRing();
    const rec = ring1.seal('x');
    const ring2 = new KeyRing();
    expect(() => ring2.open(rec)).toThrow(CryptoError);
  });
});

describe('FieldEncryptor', () => {
  it('encrypts selected fields only', () => {
    const ring = new KeyRing();
    const enc = new FieldEncryptor(ring);
    const rec = enc.encryptFields(
      { id: 'u1', name: 'Alice', ssn: '123-45-6789', nested: { card: '4242' } },
      [{ path: 'ssn' }, { path: 'nested.card' }],
      { recordId: 'u1' }
    );
    expect(rec['name']).toBe('Alice');
    expect((rec['ssn'] as { __enc: boolean }).__enc).toBe(true);
    expect((rec['nested'] as Record<string, unknown>)['card']).toHaveProperty('__enc');

    const dec = enc.decryptFields(rec, [{ path: 'ssn' }, { path: 'nested.card' }], { recordId: 'u1' });
    expect(dec['ssn']).toBe('123-45-6789');
    expect((dec['nested'] as Record<string, string>)['card']).toBe('4242');
  });

  it('binds ciphertext to the record — decrypt fails with wrong recordId', () => {
    const ring = new KeyRing();
    const enc = new FieldEncryptor(ring);
    const rec = enc.encryptFields({ ssn: '1' }, [{ path: 'ssn' }], { recordId: 'A' });
    expect(() =>
      enc.decryptFields(rec, [{ path: 'ssn' }], { recordId: 'B' })
    ).toThrow(CryptoError);
  });

  it('rotates fields under new KEK', () => {
    const ring = new KeyRing();
    const enc = new FieldEncryptor(ring);
    const rec = enc.encryptFields({ s: 'x' }, [{ path: 's' }], { recordId: 'r' });
    ring.rotateKek();
    const rotated = enc.rotateFields(rec, [{ path: 's' }]);
    const dec = enc.decryptFields(rotated, [{ path: 's' }], { recordId: 'r' });
    expect(dec['s']).toBe('x');
  });
});

describe('SecureRandom', () => {
  it('produces distinct values', () => {
    const a = SecureRandom.hex();
    const b = SecureRandom.hex();
    expect(a).not.toBe(b);
    expect(a).toHaveLength(64);
  });
  it('numericCode is 0-padded', () => {
    for (let i = 0; i < 20; i++) {
      expect(SecureRandom.numericCode(6)).toMatch(/^\d{6}$/);
    }
  });
  it('rejects absurd sizes', () => {
    expect(() => SecureRandom.bytes(0)).toThrow(CryptoError);
  });
});
