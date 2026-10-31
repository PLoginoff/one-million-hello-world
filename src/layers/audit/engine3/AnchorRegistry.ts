/**
 * Anchor Registry — External Witness Receipt Ledger
 *
 * Companion to `Notarizer`: while the notarizer *produces* anchors,
 * the registry is the queryable index over them — the lookup a
 * compliance officer or an external verifier actually uses:
 *
 *  - which anchors cover record seq X?
 *  - what's the attestation timeline between two checkpoints?
 *  - do any seq ranges lack anchor coverage? (anchoring gaps are
 *    the integrity hole an attacker would exploit — a record written
 *    after the last anchor has only the local chain protecting it)
 *  - are all anchor receipts accounted for and internally consistent?
 *
 * The registry also deduplicates: re-registering an anchor with the
 * same root and range is idempotent, but a conflicting anchor
 * (same range, different root) is a red flag — two different
 * Merkle roots can't both commit to the same record set. Conflicts
 * are journaled rather than rejected outright because a conflict IS
 * the evidence of a forked or rewritten chain.
 *
 * Gap analysis is interval math over anchor ranges — O(N log N)
 * sort-and-sweep, sharing the proof-journal's convention.
 *
 * @module AuditLayer/Engine3
 */

import type { NotarizationAnchor } from './types3';
import { AuditClock3, SystemAuditClock3 } from './types3';

/** A registered anchor plus when the registry learned of it. */
export interface RegisteredAnchor {
  readonly anchor: NotarizationAnchor;
  /** When the registry recorded it. */
  readonly registeredAt: number;
  /** Source tag, e.g. 'local' or a witness id. */
  readonly source: string;
}

/** Two anchors claiming the same range with different roots. */
export interface AnchorConflict {
  readonly existing: NotarizationAnchor;
  readonly incoming: NotarizationAnchor;
  readonly detectedAt: number;
}

export interface RegistryGap {
  readonly fromSeq: number;
  readonly toSeq: number;
}

export interface RegistryStats {
  readonly anchors: number;
  readonly conflicts: number;
  readonly coveredSeqs: number;
  /** True when every seq from the lowest covered is anchored. */
  readonly fullyCovered: boolean;
  readonly sources: readonly string[];
}

export class AnchorRegistry {
  private readonly clock: AuditClock3;
  private readonly anchors: RegisteredAnchor[] = [];
  private readonly conflicts: AnchorConflict[] = [];
  /** Deduplication index: "fromSeq:toSeq:root" → registered. */
  private readonly byKey = new Map<string, RegisteredAnchor>();

  constructor(options: { clock?: AuditClock3 } = {}) {
    this.clock = options.clock ?? new SystemAuditClock3();
  }

  /**
   * Record an anchor. Idempotent on (range, root) duplicates;
   * conflicting anchors (same range, different root) are journaled
   * and registered anyway — the conflict IS the evidence.
   */
  register(anchor: NotarizationAnchor, source = 'local'): RegisteredAnchor {
    const key = `${anchor.fromSeq}:${anchor.toSeq}:${anchor.merkleRoot}`;
    const existing = this.byKey.get(key);
    if (existing) return existing;

    // Conflict check: same exact range with a different root.
    for (const r of this.anchors) {
      const a = r.anchor;
      if (a.fromSeq === anchor.fromSeq && a.toSeq === anchor.toSeq && a.merkleRoot !== anchor.merkleRoot) {
        this.conflicts.push({ existing: a, incoming: anchor, detectedAt: this.clock.now() });
      }
    }

    const reg: RegisteredAnchor = {
      anchor,
      registeredAt: this.clock.now(),
      source,
    };
    this.anchors.push(reg);
    this.byKey.set(key, reg);
    return reg;
  }

  /** Anchors covering seq X (a seq can be covered by several). */
  covering(seq: number): readonly NotarizationAnchor[] {
    return this.anchors.filter((r) => r.anchor.fromSeq <= seq && r.anchor.toSeq >= seq).map((r) => r.anchor);
  }

  /** Anchors in seq order. */
  list(): readonly RegisteredAnchor[] {
    return [...this.anchors].sort((a, b) => a.anchor.fromSeq - b.anchor.fromSeq || a.anchor.toSeq - b.anchor.toSeq);
  }

  /**
   * Seq ranges in [1, throughSeq] with NO anchor coverage — the
   * unanchored tail an auditor must chase.
   */
  gaps(throughSeq: number): readonly RegistryGap[] {
    if (throughSeq < 1) return [];
    const intervals = this.anchors
      .map((r) => ({ from: r.anchor.fromSeq, to: r.anchor.toSeq }))
      .sort((a, b) => a.from - b.from || a.to - b.to);

    const merged: { from: number; to: number }[] = [];
    for (const i of intervals) {
      const last = merged[merged.length - 1];
      if (last && i.from <= last.to + 1) last.to = Math.max(last.to, i.to);
      else merged.push({ ...i });
    }

    const gaps: RegistryGap[] = [];
    let cursor = 1;
    for (const m of merged) {
      if (m.from > cursor) gaps.push({ fromSeq: cursor, toSeq: m.from - 1 });
      cursor = Math.max(cursor, m.to + 1);
      if (cursor > throughSeq) break;
    }
    if (cursor <= throughSeq) gaps.push({ fromSeq: cursor, toSeq: throughSeq });
    return gaps;
  }

  /** Conflicts detected so far. */
  conflictList(): readonly AnchorConflict[] {
    return this.conflicts;
  }

  /**
   * Verify pairwise chain linkage: each anchor's previousAnchorHash
   * must match some registered anchor's hash (or the anchor must be
   * the first in its chain). Returns the seqs that fail linkage.
   */
  verifyLinkage(): { ok: boolean; unlinked: readonly number[] } {
    const hashes = new Set(this.anchors.map((r) => r.anchor.anchorHash));
    const unlinked: number[] = [];
    for (const r of this.anchors) {
      const a = r.anchor;
      // The first anchor links to the public genesis constant —
      // detectable because no registered anchor carries its prev hash.
      if (!hashes.has(a.previousAnchorHash)) {
        // Only flag when it's not the earliest anchor — the first
        // anchor's prev is genesis by construction.
        const isFirst = this.anchors.every(
          (o) => o.anchor.seq >= a.seq || o.anchor.anchoredAt > a.anchoredAt
        );
        if (!isFirst && a.seq !== 1) unlinked.push(a.seq);
      }
    }
    return { ok: unlinked.length === 0, unlinked };
  }

  stats(throughSeq?: number): RegistryStats {
    const sources = [...new Set(this.anchors.map((r) => r.source))].sort();
    let covered = 0;
    const intervals = this.anchors
      .map((r) => ({ from: r.anchor.fromSeq, to: r.anchor.toSeq }))
      .sort((a, b) => a.from - b.from || a.to - b.to);
    let curFrom: number | undefined;
    let curTo: number | undefined;
    for (const i of intervals) {
      if (curFrom === undefined) {
        curFrom = i.from;
        curTo = i.to;
      } else if (i.from <= curTo! + 1) {
        curTo = Math.max(curTo!, i.to);
      } else {
        covered += curTo! - curFrom + 1;
        curFrom = i.from;
        curTo = i.to;
      }
    }
    if (curFrom !== undefined) covered += curTo! - curFrom + 1;
    const fullyCovered = throughSeq !== undefined ? this.gaps(throughSeq).length === 0 : true;
    return {
      anchors: this.anchors.length,
      conflicts: this.conflicts.length,
      coveredSeqs: covered,
      fullyCovered,
      sources,
    };
  }
}
