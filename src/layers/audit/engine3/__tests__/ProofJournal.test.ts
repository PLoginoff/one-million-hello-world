/**
 * Tests for ProofJournal: sweep coverage intervals, attestation
 * chaining, investigation lifecycle and counter-evidence lookup.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ProofJournal, GENESIS_ATTESTATION } from '../ProofJournal';
import { ManualAuditClock3 } from '../types3';

describe('ProofJournal — sweeps and coverage', () => {
  let clock: ManualAuditClock3;
  let journal: ProofJournal;

  beforeEach(() => {
    clock = new ManualAuditClock3(0);
    journal = new ProofJournal({ clock });
  });

  const sweep = (fromSeq: number, toSeq: number, result: 'clean' | 'corrupt' | 'partial' = 'clean') =>
    journal.recordSweep({ fromSeq, toSeq, result, verifier: 'svc-audit', tipHash: 'x'.repeat(64) });

  it('records sweeps with ids and timestamps', () => {
    const s = sweep(1, 100);
    expect(s.id).toBe('sweep-1');
    expect(s.ranAt).toBe(0);
    clock.advance(50);
    const s2 = sweep(101, 200);
    expect(s2.ranAt).toBe(50);
  });

  it('rejects invalid ranges', () => {
    expect(() => sweep(0, 10)).toThrow();
    expect(() => sweep(50, 40)).toThrow();
  });

  it('uncovered returns gaps between clean sweeps', () => {
    sweep(1, 100);
    sweep(200, 300);
    sweep(301, 400); // adjacent merges with previous
    const gaps = journal.uncovered(500);
    expect(gaps).toEqual([
      { fromSeq: 101, toSeq: 199 },
      { fromSeq: 401, toSeq: 500 },
    ]);
  });

  it('overlapping sweeps merge for coverage', () => {
    sweep(1, 100);
    sweep(50, 200); // overlaps and extends
    const gaps = journal.uncovered(300);
    expect(gaps).toEqual([{ fromSeq: 201, toSeq: 300 }]);
  });

  it('corrupt and partial sweeps do not count as coverage', () => {
    sweep(1, 100, 'corrupt');
    sweep(50, 150, 'partial');
    sweep(100, 200, 'clean');
    const gaps = journal.uncovered(200);
    expect(gaps).toEqual([{ fromSeq: 1, toSeq: 99 }]);
  });

  it('uncovered with no sweeps returns the whole range', () => {
    expect(journal.uncovered(10)).toEqual([{ fromSeq: 1, toSeq: 10 }]);
    expect(journal.uncovered(0)).toEqual([]);
  });

  it('sweepsOver returns overlapping sweeps only', () => {
    sweep(1, 100);
    sweep(150, 200);
    sweep(300, 400);
    const hits = journal.sweepsOver(90, 160);
    expect(hits.map((s) => s.id)).toEqual(['sweep-1', 'sweep-2']);
  });
});

describe('ProofJournal — attestations', () => {
  let clock: ManualAuditClock3;
  let journal: ProofJournal;

  beforeEach(() => {
    clock = new ManualAuditClock3(1_000);
    journal = new ProofJournal({ clock });
  });

  it('chains attestations via previousAttestationHash', () => {
    const a1 = journal.attest({
      subject: 'anchor',
      subjectHash: 'r'.repeat(64),
      fromSeq: 1,
      toSeq: 50,
      auditor: 'ext-audit-1',
    });
    expect(a1.previousAttestationHash).toBe(GENESIS_ATTESTATION);
    const a2 = journal.attest({
      subject: 'segment',
      subjectHash: 's'.repeat(64),
      fromSeq: 51,
      toSeq: 100,
      auditor: 'ext-audit-1',
    });
    expect(a2.previousAttestationHash).toBe(a1.attestationHash);
    expect(journal.verifyAttestations().ok).toBe(true);
  });

  it('detects attestation tampering', () => {
    journal.attest({
      subject: 'chain',
      subjectHash: 't'.repeat(64),
      fromSeq: 1,
      toSeq: 10,
      auditor: 'a',
    });
    const list = (journal as unknown as { attestations: { auditor: string }[] }).attestations;
    list[0]!.auditor = 'mallory';
    const check = journal.verifyAttestations();
    expect(check.ok).toBe(false);
    expect(check.firstBadSeq).toBe(1);
  });

  it('detects broken attestation links', () => {
    const a1 = journal.attest({
      subject: 'chain',
      subjectHash: 'x'.repeat(64),
      fromSeq: 1,
      toSeq: 10,
      auditor: 'a',
    });
    const a2 = journal.attest({
      subject: 'chain',
      subjectHash: 'y'.repeat(64),
      fromSeq: 11,
      toSeq: 20,
      auditor: 'a',
    });
    // Forge the second attestation with a wrong link.
    const forged = { ...a2, previousAttestationHash: 'f'.repeat(64) };
    const list = (journal as unknown as { attestations: unknown[] }).attestations;
    list[1] = forged;
    expect(journal.verifyAttestations().ok).toBe(false);
    void a1;
  });

  it('attestationsOver filters by overlap', () => {
    journal.attest({ subject: 'anchor', subjectHash: 'a'.repeat(64), fromSeq: 1, toSeq: 100, auditor: 'x' });
    journal.attest({ subject: 'anchor', subjectHash: 'b'.repeat(64), fromSeq: 500, toSeq: 600, auditor: 'x' });
    expect(journal.attestationsOver(50, 60).length).toBe(1);
    expect(journal.attestationsOver(200, 400).length).toBe(0);
  });

  it('attestation timestamp comes from the clock', () => {
    clock.set(9_999);
    const a = journal.attest({
      subject: 'anchor',
      subjectHash: 'z'.repeat(64),
      fromSeq: 1,
      toSeq: 1,
      auditor: 'a',
    });
    expect(a.at).toBe(9_999);
  });
});

describe('ProofJournal — investigations', () => {
  let clock: ManualAuditClock3;
  let journal: ProofJournal;

  beforeEach(() => {
    clock = new ManualAuditClock3(0);
    journal = new ProofJournal({ clock });
  });

  const corruptSweep = () =>
    journal.recordSweep({
      fromSeq: 10,
      toSeq: 20,
      result: 'corrupt',
      firstBadSeq: 14,
      verifier: 'svc',
      tipHash: 'h'.repeat(64),
    });

  it('opens an investigation off a corrupt sweep', () => {
    const sweep = corruptSweep();
    const inv = journal.openInvestigation(sweep);
    expect(inv.status).toBe('open');
    // suspects default to firstBad..toSeq: 14..20 → 7 seqs
    expect(inv.suspectSeqs.length).toBe(7);
    expect(inv.suspectSeqs[0]).toBe(14);
    expect(inv.triggerSweepId).toBe(sweep.id);
  });

  it('explicit suspectSeqs override the default derivation', () => {
    const inv = journal.openInvestigation(corruptSweep(), { suspectSeqs: [14] });
    expect(inv.suspectSeqs).toEqual([14]);
  });

  it('evidence notes accumulate with timestamps', () => {
    const inv = journal.openInvestigation(corruptSweep());
    clock.advance(10);
    journal.addNote(inv.id, 'analyst-1', 'replicated hash mismatch', 'e'.repeat(64));
    clock.advance(10);
    journal.addNote(inv.id, 'analyst-2', 'root cause: disk fault');
    const updated = journal.get(inv.id)!;
    expect(updated.evidence.length).toBe(2);
    expect(updated.evidence[0]!.at).toBe(10);
    expect(updated.evidence[1]!.at).toBe(20);
    expect(updated.evidence[0]!.evidenceHash).toBe('e'.repeat(64));
  });

  it('resolve freezes the investigation', () => {
    const inv = journal.openInvestigation(corruptSweep());
    journal.resolve(inv.id, 'hardware fault, records re-replicated');
    expect(journal.get(inv.id)!.status).toBe('resolved');
    expect(journal.get(inv.id)!.resolution).toContain('hardware');
    expect(() => journal.addNote(inv.id, 'x', 'late note')).toThrow(/resolved/);
    expect(() => journal.resolve(inv.id, 'again')).toThrow(/resolved/);
  });

  it('escalate moves open → escalated and blocks re-escalation', () => {
    const inv = journal.openInvestigation(corruptSweep());
    journal.escalate(inv.id);
    expect(journal.get(inv.id)!.status).toBe('escalated');
    expect(() => journal.escalate(inv.id)).toThrow(/cannot escalate/);
  });

  it('counterEvidence surfaces clean sweeps and attestations over the suspect range', () => {
    // A clean sweep covering 10..20 BEFORE the corrupt one.
    journal.recordSweep({ fromSeq: 10, toSeq: 20, result: 'clean', verifier: 'v', tipHash: 't'.repeat(64) });
    journal.attest({ subject: 'anchor', subjectHash: 'r'.repeat(64), fromSeq: 1, toSeq: 50, auditor: 'ext' });
    const sweep = corruptSweep();
    const inv = journal.openInvestigation(sweep, { suspectSeqs: [14, 15, 16] });
    const ce = journal.counterEvidence(inv);
    expect(ce.cleanSweeps.length).toBe(1);
    expect(ce.attestations.length).toBe(1);
  });

  it('listInvestigations filters by status', () => {
    const s = corruptSweep();
    const i1 = journal.openInvestigation(s);
    journal.openInvestigation(s);
    journal.resolve(i1.id, 'done');
    expect(journal.listInvestigations('open').length).toBe(1);
    expect(journal.listInvestigations('resolved').length).toBe(1);
    expect(journal.listInvestigations().length).toBe(2);
  });

  it('operations on unknown ids throw', () => {
    expect(() => journal.addNote('ghost', 'a', 'n')).toThrow();
    expect(() => journal.resolve('ghost', 'r')).toThrow();
    expect(() => journal.escalate('ghost')).toThrow();
  });
});

describe('ProofJournal — stats', () => {
  it('aggregates sweep kinds, attestations, investigations and coverage', () => {
    const clock = new ManualAuditClock3(0);
    const j = new ProofJournal({ clock });
    j.recordSweep({ fromSeq: 1, toSeq: 100, result: 'clean', verifier: 'v', tipHash: 'x'.repeat(64) });
    j.recordSweep({ fromSeq: 50, toSeq: 150, result: 'clean', verifier: 'v', tipHash: 'y'.repeat(64) });
    j.recordSweep({ fromSeq: 200, toSeq: 250, result: 'corrupt', firstBadSeq: 210, verifier: 'v', tipHash: 'z'.repeat(64) });
    j.attest({ subject: 'chain', subjectHash: 'a'.repeat(64), fromSeq: 1, toSeq: 150, auditor: 'aud' });
    j.openInvestigation(j.sweepsOver(200, 250)[0]!);
    const s = j.stats();
    expect(s.sweeps).toBe(3);
    expect(s.cleanSweeps).toBe(2);
    expect(s.corruptSweeps).toBe(1);
    expect(s.attestations).toBe(1);
    expect(s.openInvestigations).toBe(1);
    // Clean coverage = union of [1,100] and [50,150] = 150 seqs.
    expect(s.coveredSeqs).toBe(150);
  });
});
