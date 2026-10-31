/**
 * Erasure Ledger — GDPR Right-to-Erasure Tracking
 *
 * Complements `ComplianceExportScheduler` (data-out requests) with
 * the inverse duty: proving *deletion*. Under GDPR Art. 17 an
 * organization must not only erase a subject's personal data but be
 * able to demonstrate the erasure happened — while the audit log
 * itself is immutable and cannot be rewritten.
 *
 * The design resolves the apparent contradiction:
 *
 *  - **Crypto-erasure receipts.** Rather than mutating the hash
 *    chain (which would break every downstream hash), an erasure
 *    request produces a *tombstone*: a hash-chained ledger entry
 *    recording which record ids were covered, the erasure method
 *    (`crypto-shred` = key destruction for field-level encryption,
 *    `tombstone` = marker for downstream stores, `purge` = physical
 *    deletion allowed by policy), and a proof hash binding the
 *    receipt to the covered record ids.
 *
 *  - **Coverage tracking.** `isErased(recordId)` answers the audit
 *    question "was this record's subject data verifiably erased?"
 *    Partial coverage is tracked per request so a follow-up pass
 *    can close residual records (a record appended *after* the
 *    request was filed still needs erasure — the ledger supports
 *    range extension).
 *
 *  - **Verification.** Receipts chain like audit records:
 *    `verify()` detects tampering with the ledger itself. Because
 *    receipts commit to the covered id set via a Merkle root,
 *    `proveCoverage(recordId)` yields a portable inclusion proof
 *    the same shape as the notarizer's.
 *
 * This is the audit layer auditing its own GDPR compliance.
 *
 * Complexity: request O(1); cover O(N) Merkle build; verify O(N).
 *
 * @module AuditLayer/Engine3
 */

import { createHash } from 'crypto';
import { canonicalJson } from '../engine/HashChain';
import { buildMerkleTree, merkleProof, verifyMerkleProof } from './Notarizer';
import { AuditClock3, MerkleProof, SystemAuditClock3 } from './types3';

function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

export const GENESIS_ERASURE = sha256Hex('erasure-ledger-genesis');

/** How the covered data was (or will be) destroyed. */
export type ErasureMethod =
  /** Destroy the field-encryption key — data becomes unreadable. */
  | 'crypto-shred'
  /** Tombstone marker for downstream mutable stores. */
  | 'tombstone'
  /** Physical deletion where policy permits (non-chain storage). */
  | 'purge';

export interface ErasureReceipt {
  readonly seq: number;
  /** The erasure request this covers. */
  readonly requestId: string;
  /** Data subject. */
  readonly subjectId: string;
  /** Record ids covered by this receipt (sorted). */
  readonly recordIds: readonly string[];
  /** Merkle root over the sorted record ids. */
  readonly coverageRoot: string;
  readonly method: ErasureMethod;
  /** Who executed the erasure (service or operator id). */
  readonly executor: string;
  readonly executedAt: number;
  readonly previousReceiptHash: string;
  readonly receiptHash: string;
}

export interface ErasureRequest {
  readonly id: string;
  readonly subjectId: string;
  /** Record ids identified for erasure at filing time. */
  readonly targetRecordIds: readonly string[];
  readonly filedAt: number;
  /** Receipt ids issued against this request. */
  readonly receiptHashes: string[];
}

export interface ErasureStatus {
  readonly requestId: string;
  readonly subjectId: string;
  readonly totalTargets: number;
  /** Target record ids already covered by at least one receipt. */
  readonly covered: number;
  /** Target ids still uncovered. */
  readonly outstanding: readonly string[];
  /** True when every target id has a receipt. */
  readonly complete: boolean;
}

export class ErasureLedger {
  private readonly clock: AuditClock3;
  private readonly requests = new Map<string, ErasureRequest>();
  private readonly receipts: ErasureReceipt[] = [];
  /** recordId → receiptHash index for isErased lookups. */
  private readonly coveredBy = new Map<string, string>();
  /** requestId → coverage Merkle trees for proof generation. */
  private readonly coverageTrees = new Map<string, string[][]>();
  private seq = 0;
  private idSeq = 0;

  constructor(options: { clock?: AuditClock3 } = {}) {
    this.clock = options.clock ?? new SystemAuditClock3();
  }

  /** File an erasure request naming the target records. */
  file(subjectId: string, targetRecordIds: readonly string[], id?: string): ErasureRequest {
    if (!subjectId) throw new Error('subjectId is required');
    const req: ErasureRequest = {
      id: id ?? `erasure-${++this.idSeq}`,
      subjectId,
      targetRecordIds: [...targetRecordIds].sort(),
      filedAt: this.clock.now(),
      receiptHashes: [],
    };
    if (this.requests.has(req.id)) throw new Error(`request ${req.id} already exists`);
    this.requests.set(req.id, req);
    return req;
  }

  /**
   * Issue an erasure receipt covering `recordIds` of a request.
   * Receipts may cover the target set incrementally — multiple
   * receipts per request are normal (batch erasure).
   */
  cover(
    requestId: string,
    recordIds: readonly string[],
    opts: { method: ErasureMethod; executor: string }
  ): ErasureReceipt {
    const req = this.requests.get(requestId);
    if (!req) throw new Error(`unknown request ${requestId}`);
    if (recordIds.length === 0) throw new Error('receipt must cover at least one record');
    const sorted = [...recordIds].sort();
    const tree = buildMerkleTree(sorted.map((id) => sha256Hex(`erasure:${id}`)));
    const coverageRoot = tree[tree.length - 1]![0]!;

    const prev = this.receipts[this.receipts.length - 1];
    const base = {
      seq: ++this.seq,
      requestId,
      subjectId: req.subjectId,
      recordIds: sorted,
      coverageRoot,
      method: opts.method,
      executor: opts.executor,
      executedAt: this.clock.now(),
      previousReceiptHash: prev?.receiptHash ?? GENESIS_ERASURE,
    };
    const receipt: ErasureReceipt = {
      ...base,
      receiptHash: sha256Hex(canonicalJson(base)),
    };
    this.receipts.push(receipt);
    req.receiptHashes.push(receipt.receiptHash);
    for (const id of sorted) this.coveredBy.set(id, receipt.receiptHash);
    this.coverageTrees.set(receipt.receiptHash, tree);
    return receipt;
  }

  /** Extend a request's target set (records appended post-filing). */
  extend(requestId: string, additionalRecordIds: readonly string[]): ErasureRequest {
    const req = this.requests.get(requestId);
    if (!req) throw new Error(`unknown request ${requestId}`);
    const merged = new Set([...req.targetRecordIds, ...additionalRecordIds]);
    const updated: ErasureRequest = {
      ...req,
      targetRecordIds: [...merged].sort(),
    };
    this.requests.set(requestId, updated);
    return updated;
  }

  /** Was this record verifiably erased? Returns the covering receipt hash. */
  isErased(recordId: string): string | undefined {
    return this.coveredBy.get(recordId);
  }

  /** Per-request coverage status. */
  status(requestId: string): ErasureStatus {
    const req = this.requests.get(requestId);
    if (!req) throw new Error(`unknown request ${requestId}`);
    const outstanding = req.targetRecordIds.filter((id) => !this.coveredBy.has(id));
    return {
      requestId,
      subjectId: req.subjectId,
      totalTargets: req.targetRecordIds.length,
      covered: req.targetRecordIds.length - outstanding.length,
      outstanding,
      complete: outstanding.length === 0,
    };
  }

  /**
   * Portable inclusion proof: recordId ∈ receipt's coverage set.
   * A third party verifies with `verifyCoverage()` alone.
   */
  proveCoverage(receiptHash: string, recordId: string): MerkleProof | undefined {
    const tree = this.coverageTrees.get(receiptHash);
    if (!tree) return undefined;
    const leaf = sha256Hex(`erasure:${recordId}`);
    const idx = tree[0]!.indexOf(leaf);
    if (idx < 0) return undefined;
    return merkleProof(tree, leaf, idx, idx + 1);
  }

  /** Third-party check of a coverage proof against a receipt. */
  verifyCoverage(receipt: ErasureReceipt, proof: MerkleProof): boolean {
    return proof.root === receipt.coverageRoot && verifyMerkleProof(proof);
  }

  /** Verify the whole receipt chain — the ledger auditing itself. */
  verify(): { ok: boolean; firstBadSeq?: number } {
    let expected = GENESIS_ERASURE;
    for (const r of this.receipts) {
      if (r.previousReceiptHash !== expected) {
        return { ok: false, firstBadSeq: r.seq };
      }
      const { receiptHash, ...rest } = r;
      if (sha256Hex(canonicalJson(rest)) !== receiptHash) {
        return { ok: false, firstBadSeq: r.seq };
      }
      expected = receiptHash;
    }
    return { ok: true };
  }

  /** All receipts in order. */
  listReceipts(): readonly ErasureReceipt[] {
    return this.receipts;
  }

  /** All requests. */
  listRequests(): readonly ErasureRequest[] {
    return [...this.requests.values()];
  }

  /** Aggregate ledger counters. */
  stats(): { requests: number; receipts: number; recordsErased: number; complete: number } {
    let complete = 0;
    for (const req of this.requests.values()) {
      if (req.targetRecordIds.every((id) => this.coveredBy.has(id))) complete++;
    }
    return {
      requests: this.requests.size,
      receipts: this.receipts.length,
      recordsErased: this.coveredBy.size,
      complete,
    };
  }
}
