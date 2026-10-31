/**
 * Tests for RecordRedactor: deterministic masking, nested patterns,
 * wildcard rules and proof verification.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { AuditStore } from '../../engine/AuditStore';
import type { AuditRecord } from '../../engine/types';
import { RecordRedactor } from '../RecordRedactor';

describe('RecordRedactor', () => {
  let store: AuditStore;
  let record: AuditRecord;

  beforeEach(() => {
    store = new AuditStore();
    record = store.append({
      actor: 'alice@corp.com',
      action: 'doc.share',
      resource: 'doc:42',
      outcome: 'success',
      severity: 'notice',
      details: {
        email: 'alice@corp.com',
        ssn: '123-45-6789',
        meta: { ip: '10.0.0.1', ua: 'firefox' },
        recipients: [
          { email: 'bob@x.com', role: 'viewer' },
          { email: 'carol@x.com', role: 'editor' },
        ],
      },
    });
  });

  it('masks matching fields with deterministic digests', () => {
    const r = new RecordRedactor({ salt: 's1', patterns: ['details.ssn'] });
    const view = r.redact(record);
    expect(view.details['ssn']).toMatch(/^redacted:[0-9a-f]{24}$/);
    expect(view.details['email']).toBe('alice@corp.com'); // untouched
    expect(view.redactedPaths).toEqual(['details.ssn']);
    // Deterministic: same salt+path+value → same token.
    const view2 = r.redact(record);
    expect(view2.details['ssn']).toBe(view.details['ssn']);
  });

  it('different salts produce different masks', () => {
    const a = new RecordRedactor({ salt: 'a', patterns: ['details.ssn'] });
    const b = new RecordRedactor({ salt: 'b', patterns: ['details.ssn'] });
    expect(a.redact(record).details['ssn']).not.toBe(b.redact(record).details['ssn']);
  });

  it('top-level fields redact by name', () => {
    const r = new RecordRedactor({ salt: 's', patterns: ['actor'] });
    const view = r.redact(record);
    expect(view.actor).toMatch(/^redacted:/);
    expect(view.action).toBe('doc.share');
  });

  it('wildcard * matches every direct child', () => {
    const r = new RecordRedactor({ salt: 's', patterns: ['details.meta.*'] });
    const view = r.redact(record);
    const meta = view.details['meta'] as Record<string, unknown>;
    expect(meta['ip']).toMatch(/^redacted:/);
    expect(meta['ua']).toMatch(/^redacted:/);
    expect(view.redactedPaths.length).toBe(2);
  });

  it('nested wildcard pattern reaches array-of-object fields', () => {
    const r = new RecordRedactor({ salt: 's', patterns: ['details.recipients.*.email'] });
    const view = r.redact(record);
    const recips = view.details['recipients'] as { email: unknown; role: string }[];
    expect(recips[0]!.email).toMatch(/^redacted:/);
    expect(recips[1]!.email).toMatch(/^redacted:/);
    expect(recips[0]!.role).toBe('viewer'); // untouched field
  });

  it('masked values are joinable: identical values share a token', () => {
    const r2 = store.append({
      actor: 'alice@corp.com',
      action: 'doc.read',
      details: { ssn: '123-45-6789' },
    });
    const red = new RecordRedactor({ salt: 's', patterns: ['details.ssn', 'actor'] });
    const v1 = red.redact(record);
    const v2 = red.redact(r2);
    // Same actor → same mask → still groupable.
    expect(v1.actor).toBe(v2.actor);
    expect(v1.details['ssn']).toBe(v2.details['ssn']);
  });

  it('verifyRedaction accepts an honest view', () => {
    const r = new RecordRedactor({ salt: 's', patterns: ['details.ssn', 'details.meta.ip'] });
    const view = r.redact(record);
    expect(r.verifyRedaction(record, view).ok).toBe(true);
  });

  it('verifyRedaction rejects a forged view', () => {
    const r = new RecordRedactor({ salt: 's', patterns: ['details.ssn'] });
    const view = r.redact(record);
    const forged = { ...view, action: 'doc.delete' as const };
    expect(r.verifyRedaction(record, forged).ok).toBe(false);
  });

  it('verifyRedaction rejects a wrong-mask view', () => {
    const r = new RecordRedactor({ salt: 's', patterns: ['details.ssn'] });
    const view = r.redact(record);
    const forged = {
      ...view,
      details: { ...view.details, ssn: 'redacted:deadbeef' },
    };
    expect(r.verifyRedaction(record, forged).ok).toBe(false);
  });

  it('redactAll processes a batch', () => {
    const r2 = store.append({ actor: 'bob', action: 'x', details: { ssn: '9' } });
    const red = new RecordRedactor({ salt: 's', patterns: ['details.ssn'] });
    const views = red.redactAll([record, r2]);
    expect(views.length).toBe(2);
    expect(views[0]!.seq).toBe(record.seq);
    expect(views[1]!.seq).toBe(r2.seq);
  });

  it('the original record is never mutated', () => {
    const before = JSON.stringify(record);
    new RecordRedactor({ salt: 's', patterns: ['details.*'] }).redact(record);
    expect(JSON.stringify(record)).toBe(before);
    expect(record.details['ssn']).toBe('123-45-6789');
  });

  it('no matching patterns yields an empty redactedPaths and identical view', () => {
    const r = new RecordRedactor({ salt: 's', patterns: ['details.nonexistent'] });
    const view = r.redact(record);
    expect(view.redactedPaths).toEqual([]);
    expect(view.details['ssn']).toBe('123-45-6789');
    expect(r.verifyRedaction(record, view).ok).toBe(true);
  });

  it('rejects empty salt', () => {
    expect(() => new RecordRedactor({ salt: '', patterns: ['x'] })).toThrow();
  });
});
