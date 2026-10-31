/**
 * Tests for ErasureLedger: GDPR erasure receipts, coverage tracking,
 * inclusion proofs and chain verification.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ErasureLedger, GENESIS_ERASURE } from '../ErasureLedger';
import { ManualAuditClock3 } from '../types3';

describe('ErasureLedger', () => {
  let clock: ManualAuditClock3;
  let ledger: ErasureLedger;

  beforeEach(() => {
    clock = new ManualAuditClock3(0);
    ledger = new ErasureLedger({ clock });
  });

  it('files a request with sorted targets', () => {
    const req = ledger.file('alice', ['r3', 'r1', 'r2']);
    expect(req.subjectId).toBe('alice');
    expect(req.targetRecordIds).toEqual(['r1', 'r2', 'r3']);
    expect(req.filedAt).toBe(0);
  });

  it('cover issues a chained receipt and marks records erased', () => {
    const req = ledger.file('alice', ['r1', 'r2']);
    const receipt = ledger.cover(req.id, ['r1'], { method: 'tombstone', executor: 'gdpr-svc' });
    expect(receipt.seq).toBe(1);
    expect(receipt.previousReceiptHash).toBe(GENESIS_ERASURE);
    expect(receipt.coverageRoot.length).toBe(64);
    expect(ledger.isErased('r1')).toBe(receipt.receiptHash);
    expect(ledger.isErased('r2')).toBeUndefined();
  });

  it('incremental coverage completes a request over multiple receipts', () => {
    const req = ledger.file('alice', ['r1', 'r2', 'r3']);
    ledger.cover(req.id, ['r1', 'r2'], { method: 'tombstone', executor: 'svc' });
    let status = ledger.status(req.id);
    expect(status.covered).toBe(2);
    expect(status.outstanding).toEqual(['r3']);
    expect(status.complete).toBe(false);
    ledger.cover(req.id, ['r3'], { method: 'crypto-shred', executor: 'svc' });
    status = ledger.status(req.id);
    expect(status.complete).toBe(true);
    expect(status.outstanding).toEqual([]);
  });

  it('receipts chain to each other', () => {
    const req = ledger.file('alice', ['r1', 'r2']);
    const a = ledger.cover(req.id, ['r1'], { method: 'tombstone', executor: 'x' });
    const b = ledger.cover(req.id, ['r2'], { method: 'tombstone', executor: 'x' });
    expect(b.previousReceiptHash).toBe(a.receiptHash);
    expect(ledger.verify().ok).toBe(true);
  });

  it('verify detects ledger tampering', () => {
    const req = ledger.file('alice', ['r1']);
    ledger.cover(req.id, ['r1'], { method: 'purge', executor: 'x' });
    const receipts = (ledger as unknown as { receipts: { executor: string }[] }).receipts;
    receipts[0]!.executor = 'forged';
    expect(ledger.verify().ok).toBe(false);
  });

  it('extend adds late-arriving records to the target set', () => {
    const req = ledger.file('alice', ['r1']);
    ledger.extend(req.id, ['r2']);
    const updated = ledger.status(req.id);
    expect(updated.totalTargets).toBe(2);
    expect(updated.outstanding).toEqual(['r1', 'r2']);
  });

  it('proveCoverage produces a verifiable inclusion proof', () => {
    const req = ledger.file('alice', ['r1', 'r2', 'r3']);
    const receipt = ledger.cover(req.id, ['r1', 'r2', 'r3'], {
      method: 'tombstone',
      executor: 'svc',
    });
    const proof = ledger.proveCoverage(receipt.receiptHash, 'r2');
    expect(proof).toBeDefined();
    expect(ledger.verifyCoverage(receipt, proof!)).toBe(true);
    expect(ledger.proveCoverage(receipt.receiptHash, 'rX')).toBeUndefined();
  });

  it('rejects operations on unknown requests and empty coverage', () => {
    expect(() => ledger.cover('ghost', ['r1'], { method: 'tombstone', executor: 'x' })).toThrow();
    expect(() => ledger.status('ghost')).toThrow();
    expect(() => ledger.extend('ghost', ['r1'])).toThrow();
    const req = ledger.file('alice', ['r1']);
    expect(() => ledger.cover(req.id, [], { method: 'tombstone', executor: 'x' })).toThrow();
    expect(() => ledger.file('', ['r1'])).toThrow();
    expect(() => ledger.file('alice', ['r1'], req.id)).toThrow();
  });

  it('stats aggregate requests, receipts, erasures and completions', () => {
    const a = ledger.file('alice', ['r1', 'r2']);
    ledger.file('bob', ['r3']);
    ledger.cover(a.id, ['r1', 'r2'], { method: 'purge', executor: 'x' });
    const s = ledger.stats();
    expect(s.requests).toBe(2);
    expect(s.receipts).toBe(1);
    expect(s.recordsErased).toBe(2);
    expect(s.complete).toBe(1);
  });

  it('listRequests and listReceipts expose the ledger contents', () => {
    const req = ledger.file('alice', ['r1']);
    ledger.cover(req.id, ['r1'], { method: 'crypto-shred', executor: 'kms' });
    expect(ledger.listRequests().length).toBe(1);
    expect(ledger.listReceipts().length).toBe(1);
    expect(ledger.listReceipts()[0]!.method).toBe('crypto-shred');
  });
});
