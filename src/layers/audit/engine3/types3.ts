/**
 * Audit Engine3 — Shared Types
 *
 * Fourth-generation audit primitives:
 *
 * - `NotarizationAnchor`      — periodic external anchoring of the
 *                                hash chain via Merkle roots, producing
 *                                portable inclusion proofs.
 * - `SegmentCompactor`        — merges verified record ranges into
 *                                compact segments with slimmed records
 *                                and segment-level integrity proofs.
 * - `AuditAlertStreamer`      — real-time pub/sub of sealed records
 *                                through compiled filter expressions.
 * - `ComplianceExportScheduler` — GDPR-style data-export requests with
 *                                SLA deadlines, lifecycle management
 *                                and bundle assembly.
 *
 * Hashing reuses `canonicalJson`/`sha256` semantics from engine1 so
 * anchors and proofs interoperate with the existing chain format.
 *
 * @module AuditLayer/Engine3
 */

import type { AuditRecord, AuditSeverity } from '../engine/types';

/* ------------------------------------------------------------------ */
/* Clock                                                               */
/* ------------------------------------------------------------------ */

/** Millisecond clock for all engine3 classes. */
export interface AuditClock3 {
  now(): number;
}

export class SystemAuditClock3 implements AuditClock3 {
  now(): number {
    return Date.now();
  }
}

export class ManualAuditClock3 implements AuditClock3 {
  private _t: number;
  constructor(start: number = 0) {
    this._t = start;
  }
  now(): number {
    return this._t;
  }
  advance(ms: number): void {
    this._t += ms;
  }
  set(ms: number): void {
    this._t = ms;
  }
}

/* ------------------------------------------------------------------ */
/* Notarization                                                        */
/* ------------------------------------------------------------------ */

/**
 * One periodic anchor: a Merkle root over a range of record hashes,
 * "published" to an external anchor service (stubbed interface).
 */
export interface NotarizationAnchor {
  /** Monotonic anchor id (1, 2, 3, ...). */
  readonly seq: number;
  /** Inclusive record-seq range covered by this anchor. */
  readonly fromSeq: number;
  readonly toSeq: number;
  /** Merkle root over `records[fromSeq..toSeq].hash`. */
  readonly merkleRoot: string;
  /** Hash of the previous anchor — anchors form their own chain. */
  readonly previousAnchorHash: string;
  /** This anchor's id hash: sha256(anchor fields). */
  readonly anchorHash: string;
  /** When the anchor was sealed (epoch ms). */
  readonly anchoredAt: number;
  /** Receipt returned by the external anchor service. */
  readonly receipt: string;
}

/** Merkle inclusion proof for one record within an anchor. */
export interface MerkleProof {
  /** The record's chain hash being proven. */
  readonly leaf: string;
  /** Sibling hashes from leaf level up to the root. */
  readonly path: readonly ProofNode[];
  /** Expected root — compare against the anchor's merkleRoot. */
  readonly root: string;
  /** Record sequence number proven. */
  readonly seq: number;
}

export interface ProofNode {
  /** Sibling hash at this level. */
  readonly hash: string;
  /** Which side the sibling sits on when hashing upward. */
  readonly side: 'left' | 'right';
}

/** External anchor service — timestamping authority, ledger, etc. */
export interface AnchorService {
  /**
   * Publish a Merkle root; return an opaque receipt string
   * (a real impl returns an RFC 3161 token, tx id, ...).
   */
  anchor(root: string, meta: { fromSeq: number; toSeq: number; at: number }): Promise<string> | string;
}

/* ------------------------------------------------------------------ */
/* Compaction                                                          */
/* ------------------------------------------------------------------ */

/**
 * A compacted segment: a contiguous verified range collapsed to slim
 * records plus a segment-level integrity proof. Redundant per-record
 * chain metadata is replaced by one Merkle root.
 */
export interface CompactedSegment {
  readonly id: string;
  readonly fromSeq: number;
  readonly toSeq: number;
  /** Merkle root over the original record hashes — proves nothing was dropped. */
  readonly recordRoot: string;
  /** Merkle root over the slim record hashes — proves the compaction content. */
  readonly slimRoot: string;
  /** The compacted records (chain fields stripped). */
  readonly records: readonly SlimAuditRecord[];
  readonly compactedAt: number;
  /** Serialized-byte savings estimate vs. the originals. */
  readonly bytesSaved: number;
}

/** A record after chain metadata compaction. */
export interface SlimAuditRecord {
  readonly seq: number;
  readonly id: string;
  readonly timestamp: number;
  readonly actor: string;
  readonly action: string;
  readonly resource?: string;
  readonly resourceType?: string;
  readonly outcome: AuditRecord['outcome'];
  readonly severity: AuditSeverity;
  readonly details: Record<string, unknown>;
  readonly sourceIp?: string;
  readonly correlationId?: string;
  readonly tenant?: string;
  /** Hash of the slim fields — segment-chained instead of record-chained. */
  readonly slimHash: string;
}

export interface CompactionReport {
  readonly segment: CompactedSegment;
  /** Records merged into the segment. */
  readonly recordsCompacted: number;
  /** Verified before compaction — always true (compaction refuses unverified input). */
  readonly verified: true;
}

/* ------------------------------------------------------------------ */
/* Alert streaming                                                     */
/* ------------------------------------------------------------------ */

/**
 * Compiled subscription filter. Every non-undefined field must match
 * (AND semantics). `actions`/`actors` are exact-match sets;
 * `actionPrefix` matches by string prefix.
 */
export interface AlertFilter {
  readonly tenant?: string;
  readonly actors?: readonly string[];
  readonly actions?: readonly string[];
  readonly actionPrefix?: string;
  readonly resourceType?: string;
  readonly minSeverity?: AuditSeverity;
  readonly outcomes?: readonly AuditRecord['outcome'][];
}

export interface AlertSubscription {
  readonly id: string;
  readonly filter: AlertFilter;
  /** Subscriber-supplied label, e.g. a channel name. */
  readonly label?: string;
  readonly createdAt: number;
  /** Records delivered so far. */
  delivered: number;
  /** Records dropped because the per-subscription buffer overflowed. */
  dropped: number;
}

/** An alert ready for delivery. */
export interface Alert {
  readonly subscriptionId: string;
  readonly record: AuditRecord;
  /** Position of this alert within the subscription (1-based). */
  readonly deliverySeq: number;
}

/** Subscriber callback — push model. */
export type AlertListener = (alert: Alert) => void;

/* ------------------------------------------------------------------ */
/* Compliance export scheduling                                        */
/* ------------------------------------------------------------------ */

/** Lifecycle of a data-export request (GDPR Art. 15/20 pattern). */
export type ExportRequestStatus =
  | 'pending'      // accepted, awaiting assembly
  | 'processing'   // bundle being assembled
  | 'ready'        // bundle available for download
  | 'delivered'    // handed to the requester
  | 'expired'      // SLA breached before delivery
  | 'cancelled';   // withdrawn or rejected

export interface ExportRequest {
  readonly id: string;
  /** The data subject whose records are exported. */
  readonly subjectId: string;
  /** Optional scoping: only records in this tenant. */
  readonly tenant?: string;
  /** When the request was accepted (epoch ms). */
  readonly createdAt: number;
  /** SLA deadline — must reach `ready` before this (epoch ms). */
  readonly slaDeadline: number;
  status: ExportRequestStatus;
  /** Status transition log for audit-of-audits. */
  readonly history: ExportTransition[];
  /** Record ids included in the assembled bundle. */
  recordIds: readonly string[];
  /** When status reached `ready`. */
  readyAt?: number;
}

export interface ExportTransition {
  readonly from: ExportRequestStatus | 'none';
  readonly to: ExportRequestStatus;
  readonly at: number;
  readonly reason?: string;
}

/** The assembled export bundle. */
export interface ExportBundle {
  readonly requestId: string;
  readonly subjectId: string;
  readonly assembledAt: number;
  readonly records: readonly AuditRecord[];
  /** Canonical JSON of the bundle for integrity checks. */
  readonly checksum: string;
}

export interface SlaReport {
  readonly pending: number;
  readonly processing: number;
  readonly ready: number;
  readonly delivered: number;
  readonly expired: number;
  /** Requests at risk: SLA deadline within `warningMs` and not ready. */
  readonly atRisk: readonly ExportRequest[];
}
