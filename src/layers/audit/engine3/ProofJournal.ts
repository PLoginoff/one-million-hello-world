/**
 * Proof Journal — Attested Verification Ledger
 *
 * The audit system must itself be auditable. A proof journal records
 * every integrity check performed against the chain, anchors and
 * segments — who ran it, what it covered, what it found, and the
 * resulting attestation. Three artifact kinds feed the journal:
 *
 *  - **verification sweeps** — periodic `verifyIntegrity`-style
 *    passes over a record range; each sweep is journaled with its
 *    outcome so gaps in coverage are provable (a range never
 *    verified shows up as an uncovered interval).
 *
 *  - **attestations** — signed statements binding an anchor or
 *    segment to an auditor identity ("I verified root R covering
 *    seqs 1..5000 at time T"). Attestations are hash-chained like
 *    the audit records themselves, forming a parallel evidence chain.
 *
 *  - **investigations** — when a verification fails, an investigation
 *    groups the suspect records, the counter-evidence (valid proofs
 *    covering the same range, overlapping anchors), and a resolution.
 *
 * Coverage analysis is interval math over [fromSeq, toSeq] sweeps:
 * `uncovered()` returns the gaps a compliance officer must chase.
 * Interval merge is the classic sort-and-fold — O(N log N) over
 * sweep count.
 *
 * @module AuditLayer/Engine3
 */

import { createHash } from 'crypto';
import { canonicalJson } from '../engine/HashChain';
import { AuditClock3, SystemAuditClock3 } from './types3';

function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

/* ------------------------------------------------------------------ */
/* Verification sweeps                                                 */
/* ------------------------------------------------------------------ */

/** One integrity pass over a contiguous record range. */
export interface VerificationSweep {
  readonly id: string;
  readonly fromSeq: number;
  readonly toSeq: number;
  /** When the sweep ran. */
  readonly ranAt: number;
  /** Outcome of the pass. */
  readonly result: 'clean' | 'corrupt' | 'partial';
  /** First corrupt seq when result !== 'clean'. */
  readonly firstBadSeq?: number;
  /** Who/what ran the sweep (service name, auditor id). */
  readonly verifier: string;
  /** Hash of the range's tip at verification time. */
  readonly tipHash: string;
}

/* ------------------------------------------------------------------ */
/* Attestations                                                        */
/* ------------------------------------------------------------------ */

/**
 * A hash-chained attestation record. `attestationHash` covers the
 * canonical fields plus `previousAttestationHash` — the same
 * construction as the audit chain, so the journal is itself
 * tamper-evident.
 */
export interface Attestation {
  readonly seq: number;
  readonly id: string;
  /** What is being attested: an anchor root or segment root. */
  readonly subject: 'anchor' | 'segment' | 'chain';
  /** The root/tip hash attested to. */
  readonly subjectHash: string;
  /** Inclusive seq range covered. */
  readonly fromSeq: number;
  readonly toSeq: number;
  /** Auditor identity. */
  readonly auditor: string;
  readonly at: number;
  /** Optional free-form statement. */
  readonly statement?: string;
  readonly previousAttestationHash: string;
  readonly attestationHash: string;
}

/* ------------------------------------------------------------------ */
/* Investigations                                                      */
/* ------------------------------------------------------------------ */

export type InvestigationStatus = 'open' | 'resolved' | 'escalated';

export interface Investigation {
  readonly id: string;
  readonly openedAt: number;
  /** Sweep that triggered the investigation. */
  readonly triggerSweepId: string;
  /** Suspect record seqs (the corrupt or unverifiable range). */
  readonly suspectSeqs: readonly number[];
  status: InvestigationStatus;
  /** Evidence gathered: notes + proof references. */
  readonly evidence: InvestigationNote[];
  resolution?: string;
  resolvedAt?: number;
}

export interface InvestigationNote {
  readonly at: number;
  readonly author: string;
  readonly note: string;
  /** Optional hash reference to counter-evidence (proof/anchor). */
  readonly evidenceHash?: string;
}

/* ------------------------------------------------------------------ */
/* Journal                                                             */
/* ------------------------------------------------------------------ */

export interface CoverageGap {
  readonly fromSeq: number;
  readonly toSeq: number;
}

export interface JournalStats {
  readonly sweeps: number;
  readonly cleanSweeps: number;
  readonly corruptSweeps: number;
  readonly attestations: number;
  readonly openInvestigations: number;
  /** Total seq span covered by at least one clean sweep. */
  readonly coveredSeqs: number;
}

const GENESIS_ATTESTATION = sha256Hex('proof-journal-genesis');

export class ProofJournal {
  private readonly clock: AuditClock3;
  private readonly sweeps: VerificationSweep[] = [];
  private readonly attestations: Attestation[] = [];
  private readonly investigations = new Map<string, Investigation>();
  private seq = 0;
  private idSeq = 0;

  constructor(options: { clock?: AuditClock3 } = {}) {
    this.clock = options.clock ?? new SystemAuditClock3();
  }

  /* ------------------------------ sweeps ------------------------- */

  /**
   * Journal a completed verification pass. `tipHash` should be the
   * range's terminal record hash at verification time — it binds the
   * sweep to the exact state that was checked.
   */
  recordSweep(sweep: Omit<VerificationSweep, 'id' | 'ranAt'> & { ranAt?: number }): VerificationSweep {
    if (sweep.fromSeq < 1 || sweep.toSeq < sweep.fromSeq) {
      throw new Error(`invalid sweep range ${sweep.fromSeq}..${sweep.toSeq}`);
    }
    const full: VerificationSweep = {
      ...sweep,
      id: `sweep-${++this.idSeq}`,
      ranAt: sweep.ranAt ?? this.clock.now(),
    };
    this.sweeps.push(full);
    return full;
  }

  /** All sweeps overlapping [fromSeq, toSeq]. */
  sweepsOver(fromSeq: number, toSeq: number): readonly VerificationSweep[] {
    return this.sweeps.filter((s) => s.toSeq >= fromSeq && s.fromSeq <= toSeq);
  }

  /**
   * Intervals of [1, throughSeq] never covered by a *clean* sweep —
   * the compliance gap list. Corrupt/partial sweeps don't count as
   * coverage: the range still needs a clean pass.
   */
  uncovered(throughSeq: number): readonly CoverageGap[] {
    if (throughSeq < 1) return [];
    // Merge clean-sweep intervals, then subtract from [1, throughSeq].
    const intervals = this.sweeps
      .filter((s) => s.result === 'clean')
      .map((s) => ({ from: Math.max(1, s.fromSeq), to: Math.min(throughSeq, s.toSeq) }))
      .filter((i) => i.from <= i.to)
      .sort((a, b) => a.from - b.from || a.to - b.to);

    const merged: { from: number; to: number }[] = [];
    for (const i of intervals) {
      const last = merged[merged.length - 1];
      if (last && i.from <= last.to + 1) {
        last.to = Math.max(last.to, i.to);
      } else {
        merged.push({ ...i });
      }
    }

    const gaps: CoverageGap[] = [];
    let cursor = 1;
    for (const m of merged) {
      if (m.from > cursor) gaps.push({ fromSeq: cursor, toSeq: m.from - 1 });
      cursor = Math.max(cursor, m.to + 1);
      if (cursor > throughSeq) break;
    }
    if (cursor <= throughSeq) gaps.push({ fromSeq: cursor, toSeq: throughSeq });
    return gaps;
  }

  /* --------------------------- attestations ---------------------- */

  /**
   * Seal an attestation into the chain. The auditor asserts that at
   * this moment, `subjectHash` genuinely covered [fromSeq, toSeq].
   */
  attest(input: {
    subject: Attestation['subject'];
    subjectHash: string;
    fromSeq: number;
    toSeq: number;
    auditor: string;
    statement?: string;
    at?: number;
  }): Attestation {
    const prev = this.attestations[this.attestations.length - 1];
    const base = {
      seq: ++this.seq,
      id: `att-${this.idSeq + 1}-${++this.idSeq}`,
      subject: input.subject,
      subjectHash: input.subjectHash,
      fromSeq: input.fromSeq,
      toSeq: input.toSeq,
      auditor: input.auditor,
      at: input.at ?? this.clock.now(),
      statement: input.statement,
      previousAttestationHash: prev?.attestationHash ?? GENESIS_ATTESTATION,
    };
    const attestationHash = sha256Hex(canonicalJson(base));
    const att: Attestation = { ...base, attestationHash };
    this.attestations.push(att);
    return att;
  }

  /**
   * Verify the attestation chain — same construction as the audit
   * hash chain, verified the same way.
   */
  verifyAttestations(): { ok: boolean; firstBadSeq?: number } {
    let expected = GENESIS_ATTESTATION;
    for (const a of this.attestations) {
      if (a.previousAttestationHash !== expected) {
        return { ok: false, firstBadSeq: a.seq };
      }
      const { attestationHash, ...rest } = a;
      if (sha256Hex(canonicalJson(rest)) !== attestationHash) {
        return { ok: false, firstBadSeq: a.seq };
      }
      expected = attestationHash;
    }
    return { ok: true };
  }

  /** Attestations covering (overlapping) a seq range. */
  attestationsOver(fromSeq: number, toSeq: number): readonly Attestation[] {
    return this.attestations.filter((a) => a.toSeq >= fromSeq && a.fromSeq <= toSeq);
  }

  /* -------------------------- investigations --------------------- */

  /**
   * Open an investigation off a failed sweep. `suspectSeqs` defaults
   * to the sweep's corrupt point through its end.
   */
  openInvestigation(
    triggerSweep: VerificationSweep,
    opts: { suspectSeqs?: readonly number[]; id?: string } = {}
  ): Investigation {
    const suspects =
      opts.suspectSeqs ??
      (triggerSweep.firstBadSeq !== undefined
        ? range(triggerSweep.firstBadSeq, triggerSweep.toSeq)
        : [triggerSweep.fromSeq]);
    const inv: Investigation = {
      id: opts.id ?? `inv-${++this.idSeq}`,
      openedAt: this.clock.now(),
      triggerSweepId: triggerSweep.id,
      suspectSeqs: suspects,
      status: 'open',
      evidence: [],
    };
    this.investigations.set(inv.id, inv);
    return inv;
  }

  /** Add an evidence note to an open investigation. */
  addNote(id: string, author: string, note: string, evidenceHash?: string): Investigation {
    const inv = this.investigations.get(id);
    if (!inv) throw new Error(`unknown investigation ${id}`);
    if (inv.status === 'resolved') throw new Error('investigation already resolved');
    inv.evidence.push({ at: this.clock.now(), author, note, evidenceHash });
    return inv;
  }

  /**
   * Close with a resolution. A resolved investigation is immutable —
   * further notes must go to a new investigation.
   */
  resolve(id: string, resolution: string): Investigation {
    const inv = this.investigations.get(id);
    if (!inv) throw new Error(`unknown investigation ${id}`);
    if (inv.status === 'resolved') throw new Error('investigation already resolved');
    inv.status = 'resolved';
    inv.resolution = resolution;
    inv.resolvedAt = this.clock.now();
    return inv;
  }

  /** Escalate without resolving (legal hold, forensics handoff). */
  escalate(id: string): Investigation {
    const inv = this.investigations.get(id);
    if (!inv) throw new Error(`unknown investigation ${id}`);
    if (inv.status !== 'open') throw new Error(`cannot escalate ${inv.status} investigation`);
    inv.status = 'escalated';
    return inv;
  }

  /**
   * Counter-evidence check: do any *clean* sweeps or attestations
   * cover the suspect range? An attestation over a later-failed range
   * is a red flag worth surfacing in the report.
   */
  counterEvidence(inv: Investigation): {
    cleanSweeps: readonly VerificationSweep[];
    attestations: readonly Attestation[];
  } {
    const lo = Math.min(...inv.suspectSeqs);
    const hi = Math.max(...inv.suspectSeqs);
    return {
      cleanSweeps: this.sweepsOver(lo, hi).filter((s) => s.result === 'clean'),
      attestations: this.attestationsOver(lo, hi),
    };
  }

  get(id: string): Investigation | undefined {
    return this.investigations.get(id);
  }

  listInvestigations(status?: InvestigationStatus): readonly Investigation[] {
    const all = [...this.investigations.values()];
    return status === undefined ? all : all.filter((i) => i.status === status);
  }

  /* ------------------------------ stats -------------------------- */

  stats(): JournalStats {
    let covered = 0;
    // Covered span = union of clean-sweep intervals over observed seqs.
    const intervals = this.sweeps
      .filter((s) => s.result === 'clean')
      .map((s) => ({ from: s.fromSeq, to: s.toSeq }))
      .sort((a, b) => a.from - b.from || a.to - b.to);
    let curFrom: number | undefined;
    let curTo: number | undefined;
    for (const i of intervals) {
      if (curFrom === undefined) {
        curFrom = i.from;
        curTo = i.to;
      } else if (i.from <= (curTo ?? 0) + 1) {
        curTo = Math.max(curTo!, i.to);
      } else {
        covered += curTo! - curFrom + 1;
        curFrom = i.from;
        curTo = i.to;
      }
    }
    if (curFrom !== undefined) covered += curTo! - curFrom + 1;

    return {
      sweeps: this.sweeps.length,
      cleanSweeps: this.sweeps.filter((s) => s.result === 'clean').length,
      corruptSweeps: this.sweeps.filter((s) => s.result === 'corrupt').length,
      attestations: this.attestations.length,
      openInvestigations: this.listInvestigations('open').length,
      coveredSeqs: covered,
    };
  }
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}

export { GENESIS_ATTESTATION };
