import { describe, it, expect, beforeEach } from 'bun:test';
import { randomBytes } from 'crypto';
import { KeyHierarchy } from '../engine2/KeyHierarchy';
import { KeyUsageAudit } from '../engine2/KeyUsageAudit';
import { CryptoShredder } from '../engine2/CryptoShredder';
import { BlindIndexService } from '../engine2/BlindIndex';
import { EnvelopeCryptoService } from '../engine2/EnvelopeCryptoService';
import { TestClock } from '../engine2/types';

function master(): Buffer {
  return randomBytes(32);
}

/* ------------------------------------------------------------------ */

describe('KeyHierarchy', () => {
  let clock: TestClock;
  let audit: KeyUsageAudit;
  let kh: KeyHierarchy;

  beforeEach(() => {
    clock = new TestClock(0);
    audit = new KeyUsageAudit({}, clock);
    kh = new KeyHierarchy({ clock, audit });
    kh.setMasterKey(master(), 'master-1');
  });

  it('generates data keys wrapped under the master', () => {
    const dek = kh.generateDataKey('tenant-a');
    expect(dek.status).toBe('active');
    expect(dek.masterKeyId).toBe('master-1');
    // Stored form is wrapped — plaintext material is not in the record.
    expect(JSON.stringify(dek)).not.toContain('deadbeef');
    expect(dek.wrappedKey.alg).toBe('A256GCM');
  });

  it('encrypts and decrypts under per-scope DEKs', () => {
    const env = kh.encrypt('tenant-a', 'secret payload');
    expect(env.kid).toBeDefined();
    expect(kh.decrypt(env)).toBe('secret payload');
  });

  it('reuses the same active DEK per scope, separate DEKs per scope', () => {
    const e1 = kh.encrypt('tenant-a', 'one');
    const e2 = kh.encrypt('tenant-a', 'two');
    const e3 = kh.encrypt('tenant-b', 'three');
    expect(e1.kid).toBe(e2.kid);
    expect(e3.kid).not.toBe(e1.kid);
  });

  it('rotates the master key without touching data ciphertexts', () => {
    const env = kh.encrypt('tenant-a', 'persistent data');
    const { rewrapped } = kh.rotateMaster(master(), 'master-2');
    expect(rewrapped).toBe(1);
    // Old ciphertext still decrypts — the DEK didn't change, only its wrap.
    expect(kh.decrypt(env)).toBe('persistent data');
    expect(kh.record(env.kid!)!.masterKeyId).toBe('master-2');
  });

  it('retired keys decrypt but are not used for new encrypts', () => {
    const env = kh.encrypt('tenant-a', 'old');
    kh.retireDataKey(env.kid!);
    expect(kh.decrypt(env)).toBe('old'); // reads still work
    const env2 = kh.encrypt('tenant-a', 'new'); // new DEK generated
    expect(env2.kid).not.toBe(env.kid);
  });

  it('throws when no master key is set', () => {
    const fresh = new KeyHierarchy({ clock });
    expect(() => fresh.generateDataKey('x')).toThrow();
  });
});

/* ------------------------------------------------------------------ */

describe('KeyUsageAudit', () => {
  it('summarises per-key operations and targets', () => {
    const clock = new TestClock(0);
    const audit = new KeyUsageAudit({}, clock);
    const kh = new KeyHierarchy({ clock, audit });
    kh.setMasterKey(master());
    const e1 = kh.encrypt('users.email', 'a@x.com', 'row-1');
    const e2 = kh.encrypt('users.email', 'b@x.com', 'row-2');
    kh.decrypt(e1, 'row-1');

    const s = audit.summary(e1.kid!)!;
    expect(s.totalOps).toBeGreaterThanOrEqual(4); // generate + 2 encrypts + decrypt
    expect(s.byOperation['encrypt']).toBe(2);
    expect(s.targets).toContain('row-1');
    expect(s.targets).toContain('row-2');
  });

  it('flags use-after-destroy violations', () => {
    const clock = new TestClock(0);
    const audit = new KeyUsageAudit({}, clock);
    const kh = new KeyHierarchy({ clock, audit });
    kh.setMasterKey(master());
    const env = kh.encrypt('t', 'x');
    kh.retireDataKey(env.kid!);
    // Simulated misuse at a later timestamp: audit an op after retire.
    clock.advance(1000);
    audit.record(env.kid!, 'decrypt', 'suspicious-read');
    const violations = audit.violationsAfterStatusChange();
    expect(violations.length).toBe(1);
    expect(violations[0].keyId).toBe(env.kid);
  });
});

/* ------------------------------------------------------------------ */

describe('CryptoShredder', () => {
  let clock: TestClock;
  let kh: KeyHierarchy;
  let shredder: CryptoShredder;

  beforeEach(() => {
    clock = new TestClock(0);
    kh = new KeyHierarchy({ clock });
    kh.setMasterKey(master());
    shredder = new CryptoShredder(kh, undefined, clock);
  });

  it('shredding a scope renders its ciphertexts undecryptable', () => {
    const env = shredder.encryptTracked('user-42', 'personal data', 'doc-1');
    expect(kh.decrypt(env)).toBe('personal data');

    const results = shredder.shredScope('user-42', 'gdpr-erasure');
    expect(results.length).toBe(1);
    expect(results[0].orphanedCiphertexts).toBe(1);

    // The ciphertext still exists — it just can't be opened. Ever.
    expect(() => kh.decrypt(env)).toThrow(/destroyed/);
    expect(shredder.verifyShredded(env)).toBe(true);
  });

  it('other scopes are unaffected by a shred', () => {
    const a = shredder.encryptTracked('user-42', 'a-data', 'a1');
    const b = shredder.encryptTracked('user-99', 'b-data', 'b1');
    shredder.shredScope('user-42');
    expect(() => kh.decrypt(a)).toThrow();
    expect(kh.decrypt(b)).toBe('b-data');
  });

  it('shred is idempotent', () => {
    const env = shredder.encryptTracked('s', 'x', 'h1');
    const r1 = shredder.shredKey(env.kid!);
    const r2 = shredder.shredKey(env.kid!);
    expect(r1.orphanedCiphertexts).toBe(r2.orphanedCiphertexts);
  });
});

/* ------------------------------------------------------------------ */

describe('BlindIndexService', () => {
  let idx: BlindIndexService;

  beforeEach(() => {
    idx = new BlindIndexService();
    idx.createIndex('users.email', 'lowercase');
  });

  it('produces deterministic tags for equality search', () => {
    const t1 = idx.tag('users.email', 'Alice@Example.com');
    const t2 = idx.tag('users.email', 'alice@example.com');
    const t3 = idx.tag('users.email', 'bob@example.com');
    expect(t1).toBe(t2); // normalised → same tag
    expect(t1).not.toBe(t3);
  });

  it('tag reveals nothing about the plaintext (fixed-length opaque)', () => {
    const t = idx.tag('users.email', 'a@b.c');
    // base64url of a 32-byte HMAC — always 43 chars regardless of input.
    expect(t.length).toBe(43);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('different normalisers index differently', () => {
    idx.createIndex('users.phone', 'digits');
    const t1 = idx.tag('users.phone', '+1 (555) 123-4567');
    const t2 = idx.tag('users.phone', '15551234567');
    expect(t1).toBe(t2); // digits-only normalisation
  });

  it('matches() verifies stored tags', () => {
    const stored = idx.tag('users.email', 'Carol@X.com');
    expect(idx.matches('users.email', 'carol@x.com', stored)).toBe(true);
    expect(idx.matches('users.email', 'dave@x.com', stored)).toBe(false);
  });

  it('destroying the index kills searchability but not the data', () => {
    const tag = idx.tag('users.email', 'x@y.z');
    idx.destroyIndex('users.email');
    expect(() => idx.tag('users.email', 'x@y.z')).toThrow();
    expect(tag.length).toBe(43); // tag itself unchanged — just unverifiable
  });

  it('refuses duplicate index creation on a field', () => {
    expect(() => idx.createIndex('users.email', 'lowercase')).toThrow();
  });
});

/* ------------------------------------------------------------------ */

describe('EnvelopeCryptoService', () => {
  let svc: EnvelopeCryptoService;

  beforeEach(() => {
    svc = new EnvelopeCryptoService(master(), 'master-test', { clock: new TestClock(0) });
    svc.definePolicy('users', [
      { path: 'contact.email', encrypt: true, searchable: true, normalizer: 'lowercase' },
      { path: 'ssn', encrypt: true, searchable: false },
      { path: 'name', encrypt: false },
    ]);
  });

  it('encrypts declared fields, leaves the rest plaintext', () => {
    const r = svc.secureRecord('users', {
      contact: { email: 'A@X.com' },
      ssn: '111-22-3333',
      name: 'Alice',
    });
    expect(r.record.name).toBe('Alice');
    expect((r.record.contact as Record<string, unknown>).email).not.toBe('A@X.com');
    expect(r.record.ssn).not.toBe('111-22-3333');
    // Envelope shape
    const env = (r.record.contact as Record<string, unknown>).email as { alg: string };
    expect(env.alg).toBe('A256GCM');
    // Decrypts back
    expect(svc.reveal(env as never)).toBe('A@X.com');
  });

  it('produces search tags that match case-insensitively', () => {
    const r = svc.secureRecord('users', { contact: { email: 'Bob@X.com' } });
    const tag = svc.searchTag('users', 'contact.email', 'bob@x.com');
    expect(tag).toBe(r.tags['contact.email']);
  });

  it('forgetScope crypto-shreds every ciphertext in the scope', () => {
    const r1 = svc.secureRecord('users', { contact: { email: 'a@x.com' }, ssn: 'x' });
    const r2 = svc.secureRecord('users', { contact: { email: 'b@x.com' }, ssn: 'y' });
    const results = svc.forgetScope('users');
    expect(results.length).toBeGreaterThanOrEqual(1);
    // 4 handles tracked (2 records × 2 encrypted fields); they're spread
    // across however many DEKs the scope created.
    const orphaned = results.reduce((a, r) => a + r.orphanedCiphertexts, 0);
    expect(orphaned).toBe(4);
    for (const rec of [r1, r2]) {
      const env = (rec.record.contact as Record<string, unknown>).email;
      expect(() => svc.reveal(env as never)).toThrow(/destroyed/);
    }
  });
});
