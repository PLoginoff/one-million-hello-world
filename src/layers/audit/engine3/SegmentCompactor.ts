/**
 * Audit Segment Compactor
 *
 * Merges verified record ranges into compact segments, dropping
 * redundant per-record chain metadata while preserving provable
 * integrity:
 *
 *  - **Verification gate.** Compaction refuses input that fails
 *     `verifyChain()` — a corrupted range must never be compacted
 *     (compaction would launder the corruption).
 *
 *  - **Dual roots.** Each segment carries `recordRoot` (Merkle root
 *     of the *original* record hashes — proves the compaction consumed
 *     exactly these records) and `slimRoot` (Merkle root of the slim
 *     record hashes — proves the compacted content itself).
 *
 *  - **Slim records.** Chain fields (`previousHash`, `hash`, `tier`)
 *     are replaced by a single `slimHash` — sha256 over the canonical
 *     slim fields — which re-chains inside the segment. Savings are
 *     ~130+ bytes/record plus dropped hash-chain redundancy.
 *
 *  - **Spot-checkable.** `verifySegment()` rebuilds the slim root
 *     and checks a random-or-indexed record's inclusion proof.
 *
 * Typical use: hot-tier records age to warm, get chain-verified once,
 * then compact N:1 into a segment for cheap archival storage.
 *
 * Complexity: compaction O(N) hashes; verification O(N); proof
 * O(log N).
 *
 * @module AuditLayer/Engine3
 */

import { createHash } from 'crypto';
import type { AuditRecord } from '../engine/types';
import { canonicalJson, computeRecordHash, verifyChain } from '../engine/HashChain';
import { buildMerkleTree, merkleProof, verifyMerkleProof } from './Notarizer';
import {
  AuditClock3,
  CompactedSegment,
  CompactionReport,
  MerkleProof,
  SlimAuditRecord,
  SystemAuditClock3,
} from './types3';

function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

/** Canonical serialization of a slim record's covered fields. */
function slimHashOf(r: Omit<SlimAuditRecord, 'slimHash'>): string {
  return sha256Hex(canonicalJson(r));
}

/** Strip chain metadata from a record and re-hash the slim fields. */
function slimify(r: AuditRecord): SlimAuditRecord {
  const slim: Omit<SlimAuditRecord, 'slimHash'> = {
    seq: r.seq,
    id: r.id,
    timestamp: r.timestamp,
    actor: r.actor,
    action: r.action,
    resource: r.resource,
    resourceType: r.resourceType,
    outcome: r.outcome,
    severity: r.severity,
    details: r.details,
    sourceIp: r.sourceIp,
    correlationId: r.correlationId,
    tenant: r.tenant,
  };
  return { ...slim, slimHash: slimHashOf(slim) };
}

export interface CompactorOptions {
  readonly clock?: AuditClock3;
  /** Injectable id source for segment ids. */
  readonly idGen?: () => string;
}

let defaultSegSeq = 0;

export class SegmentCompactor {
  private readonly clock: AuditClock3;
  private readonly idGen: () => string;
  private readonly segments = new Map<string, CompactedSegment>();
  /** seq → segmentId index for record→segment lookup. */
  private readonly bySeq = new Map<number, string>();

  constructor(options: CompactorOptions = {}) {
    this.clock = options.clock ?? new SystemAuditClock3();
    this.idGen = options.idGen ?? (() => `seg-${++defaultSegSeq}`);
  }

  /**
   * Verify then compact a contiguous record range into one segment.
   *
   * `anchorPrevHash` lets callers compact a mid-chain segment: when
   * supplied, the first record's `previousHash` is checked against it
   * (instead of GENESIS) before per-record verification — the same
   * gate `ChainAnchorer` needs when anchoring a continuation range.
   *
   * @throws when the range is empty, non-contiguous, already
   *         compacted, or fails chain verification.
   */
  compact(records: readonly AuditRecord[], anchorPrevHash?: string): CompactionReport {
    if (records.length === 0) throw new Error('cannot compact an empty range');
    this.assertContiguous(records);
    for (const r of records) {
      if (this.bySeq.has(r.seq)) {
        throw new Error(`record seq ${r.seq} already compacted in ${this.bySeq.get(r.seq)}`);
      }
    }

    if (anchorPrevHash !== undefined) {
      this.verifyAgainstAnchor(records, anchorPrevHash);
    } else {
      const check = verifyChain(records);
      if (!check.ok) {
        throw new Error(
          `refusing to compact unverified range: first bad record index ${check.firstBadIndex}`
        );
      }
    }

    const slim = records.map(slimify);
    const recordTree = buildMerkleTree(records.map((r) => r.hash));
    const slimTree = buildMerkleTree(slim.map((s) => s.slimHash));

    const originalBytes = records.reduce((n, r) => n + canonicalJson(r).length, 0);
    const slimBytes = slim.reduce((n, s) => n + canonicalJson(s).length, 0);

    const segment: CompactedSegment = {
      id: this.idGen(),
      fromSeq: records[0]!.seq,
      toSeq: records[records.length - 1]!.seq,
      recordRoot: recordTree[recordTree.length - 1]![0]!,
      slimRoot: slimTree[slimTree.length - 1]![0]!,
      records: slim,
      compactedAt: this.clock.now(),
      bytesSaved: originalBytes - slimBytes,
    };
    this.segments.set(segment.id, segment);
    for (const r of records) this.bySeq.set(r.seq, segment.id);

    return {
      segment,
      recordsCompacted: records.length,
      verified: true,
    };
  }

  /**
   * Rebuild the slim tree and verify the segment root — the periodic
   * integrity sweep for archived segments.
   */
  verifySegment(segmentId: string): { ok: boolean; detail?: string } {
    const seg = this.segments.get(segmentId);
    if (!seg) return { ok: false, detail: 'unknown segment' };
    // Re-hash each slim record to catch field tampering.
    for (const s of seg.records) {
      const { slimHash, ...rest } = s;
      if (slimHashOf(rest) !== slimHash) {
        return { ok: false, detail: `slim hash mismatch at seq ${s.seq}` };
      }
    }
    const tree = buildMerkleTree(seg.records.map((s) => s.slimHash));
    const root = tree[tree.length - 1]![0]!;
    if (root !== seg.slimRoot) return { ok: false, detail: 'slim root mismatch' };
    return { ok: true };
  }

  /**
   * Inclusion proof for one slim record inside its segment — the
   * same shape as notarization proofs, so auditors can verify a
   * compacted record without the engine.
   */
  proveRecord(segmentId: string, seq: number): MerkleProof | undefined {
    const seg = this.segments.get(segmentId);
    if (!seg) return undefined;
    const idx = seg.records.findIndex((r) => r.seq === seq);
    if (idx < 0) return undefined;
    const tree = buildMerkleTree(seg.records.map((s) => s.slimHash));
    return merkleProof(tree, seg.records[idx]!.slimHash, idx, seq);
  }

  /** Verify an externally-produced proof against a stored segment. */
  verifyProof(segmentId: string, proof: MerkleProof): boolean {
    const seg = this.segments.get(segmentId);
    if (!seg) return false;
    return proof.root === seg.slimRoot && verifyMerkleProof(proof);
  }

  /** Which segment holds record `seq`, if any. */
  segmentFor(seq: number): string | undefined {
    return this.bySeq.get(seq);
  }

  get(segmentId: string): CompactedSegment | undefined {
    return this.segments.get(segmentId);
  }

  list(): readonly CompactedSegment[] {
    return [...this.segments.values()].sort((a, b) => a.fromSeq - b.fromSeq);
  }

  /** Aggregate stats across all segments. */
  stats(): { segments: number; records: number; bytesSaved: number } {
    let records = 0;
    let bytesSaved = 0;
    for (const s of this.segments.values()) {
      records += s.records.length;
      bytesSaved += s.bytesSaved;
    }
    return { segments: this.segments.size, records, bytesSaved };
  }

  /**
   * Verify a segment against an explicit anchor hash (continuation
   * segments whose first record doesn't link to GENESIS).
   */
  private verifyAgainstAnchor(records: readonly AuditRecord[], anchorPrevHash: string): void {
    let expected = anchorPrevHash;
    for (const r of records) {
      if (r.previousHash !== expected) {
        throw new Error(
          `refusing to compact unverified range: chain break at seq ${r.seq}`
        );
      }
      const { hash, ...rest } = r;
      if (computeRecordHash(rest) !== hash) {
        throw new Error(
          `refusing to compact unverified range: hash mismatch at seq ${r.seq}`
        );
      }
      expected = hash;
    }
  }

  private assertContiguous(records: readonly AuditRecord[]): void {
    for (let i = 1; i < records.length; i++) {
      if (records[i]!.seq !== records[i - 1]!.seq + 1) {
        throw new Error(
          `non-contiguous range: seq ${records[i - 1]!.seq} followed by ${records[i]!.seq}`
        );
      }
    }
  }
}
