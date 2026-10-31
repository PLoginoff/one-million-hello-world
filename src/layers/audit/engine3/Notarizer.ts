/**
 * Tamper-Evident Notarizer
 *
 * Periodically anchors the audit hash chain to an *external* witness:
 * a Merkle tree is built over a range of record hashes, the root is
 * published to an `AnchorService` (timestamping authority, public
 * ledger, sigsum-style log — stubbed interface here), and the anchor
 * itself is hash-chained to the previous anchor.
 *
 * Why Merkle roots instead of anchoring the chain tip? Two reasons:
 *
 *  1. **Inclusion proofs.** A Merkle path proves `record_i ∈ anchor`
 *     in O(log N) hashes — enough to show a single record was
 *     notarized without replaying the whole segment.
 *  2. **Range commitment.** The root commits to the *set* of records,
 *     not just the tip — a reordered-but-rechained segment would
 *     produce a different root.
 *
 * Tree construction: leaves are the record chain hashes; internal
 * nodes are `sha256(left || right)` with the hex strings concatenated
 * as UTF-8. Odd levels duplicate the last node (standard "promote"
 * rule). Construction is O(N), proof extraction O(log N), proof
 * verification O(log N).
 *
 * @module AuditLayer/Engine3
 */

import { createHash } from 'crypto';
import type { AuditRecord } from '../engine/types';
import {
  AnchorService,
  AuditClock3,
  MerkleProof,
  NotarizationAnchor,
  ProofNode,
  SystemAuditClock3,
} from './types3';

function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

/** sha256(anchorHash of nothing) — genesis for the anchor chain. */
export const GENESIS_ANCHOR = sha256Hex('audit-anchor-genesis');

/**
 * In-memory anchor service for tests/dev: records every root it sees
 * and hands back a deterministic receipt.
 */
export class InMemoryAnchorService implements AnchorService {
  readonly anchored: { root: string; fromSeq: number; toSeq: number; at: number }[] = [];
  anchor(root: string, meta: { fromSeq: number; toSeq: number; at: number }): string {
    this.anchored.push({ root, ...meta });
    return sha256Hex(`receipt:${root}:${meta.at}`);
  }
}

/** Build a Merkle tree over leaf hashes; returns levels, root last. */
export function buildMerkleTree(leaves: readonly string[]): string[][] {
  if (leaves.length === 0) return [];
  const levels: string[][] = [[...leaves]];
  let level = leaves;
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = i + 1 < level.length ? level[i + 1]! : left; // promote odd node
      next.push(sha256Hex(left + right));
    }
    levels.push(next);
    level = next;
  }
  return levels;
}

/**
 * Extract the inclusion proof for leaf at `index`. `tree` is the
 * output of `buildMerkleTree` (level 0 = leaves).
 */
export function merkleProof(tree: readonly string[][], leaf: string, index: number, seq: number): MerkleProof {
  const path: ProofNode[] = [];
  let idx = index;
  for (let level = 0; level < tree.length - 1; level++) {
    const nodes = tree[level]!;
    const isRight = idx % 2 === 1;
    const siblingIdx = isRight ? idx - 1 : idx + 1;
    if (siblingIdx < nodes.length) {
      path.push({ hash: nodes[siblingIdx]!, side: isRight ? 'left' : 'right' });
    } else {
      // Odd node promoted: sibling is itself.
      path.push({ hash: nodes[idx]!, side: 'right' });
    }
    idx = Math.floor(idx / 2);
  }
  return { leaf, path, root: tree[tree.length - 1]![0]!, seq };
}

/** Recompute the root from a proof; equality means inclusion. */
export function verifyMerkleProof(proof: MerkleProof): boolean {
  let acc = proof.leaf;
  for (const node of proof.path) {
    acc = node.side === 'left' ? sha256Hex(node.hash + acc) : sha256Hex(acc + node.hash);
  }
  return acc === proof.root;
}

function anchorHashOf(a: Omit<NotarizationAnchor, 'anchorHash' | 'receipt'>): string {
  return sha256Hex(
    `anchor:${a.seq}:${a.fromSeq}:${a.toSeq}:${a.merkleRoot}:${a.previousAnchorHash}:${a.anchoredAt}`
  );
}

export interface NotarizerOptions {
  readonly clock?: AuditClock3;
  readonly service?: AnchorService;
}

export class Notarizer {
  private readonly clock: AuditClock3;
  private readonly service: AnchorService;
  private readonly anchors: NotarizationAnchor[] = [];
  /** Record hashes by seq for proof generation. */
  private readonly trees = new Map<number, { tree: string[][]; seqs: number[] }>();

  constructor(options: NotarizerOptions = {}) {
    this.clock = options.clock ?? new SystemAuditClock3();
    this.service = options.service ?? new InMemoryAnchorService();
  }

  /**
   * Anchor a contiguous range of records. Records must be sorted by
   * `seq` ascending and contiguous (caller responsibility — typically
   * a slice of `store.query()`). Returns the sealed anchor.
   */
  async anchorRange(records: readonly AuditRecord[]): Promise<NotarizationAnchor> {
    if (records.length === 0) throw new Error('cannot anchor an empty range');
    const leaves = records.map((r) => r.hash);
    const tree = buildMerkleTree(leaves);
    const root = tree[tree.length - 1]![0]!;
    const now = this.clock.now();
    const prev = this.anchors[this.anchors.length - 1];

    const base = {
      seq: this.anchors.length + 1,
      fromSeq: records[0]!.seq,
      toSeq: records[records.length - 1]!.seq,
      merkleRoot: root,
      previousAnchorHash: prev?.anchorHash ?? GENESIS_ANCHOR,
      anchoredAt: now,
    };
    const receipt = await this.service.anchor(root, {
      fromSeq: base.fromSeq,
      toSeq: base.toSeq,
      at: now,
    });
    const anchor: NotarizationAnchor = { ...base, anchorHash: anchorHashOf(base), receipt };
    this.anchors.push(anchor);
    this.trees.set(anchor.seq, { tree, seqs: records.map((r) => r.seq) });
    return anchor;
  }

  /**
   * Inclusion proof that `record`'s hash participates in anchor
   * `anchorSeq`. Undefined when the record isn't in that range.
   */
  prove(anchorSeq: number, record: AuditRecord): MerkleProof | undefined {
    const held = this.trees.get(anchorSeq);
    if (!held) return undefined;
    const idx = held.seqs.indexOf(record.seq);
    if (idx < 0) return undefined;
    return merkleProof(held.tree, record.hash, idx, record.seq);
  }

  /**
   * Verify a record's inclusion directly against an anchor —
   * the portable, third-party check: no engine state needed.
   */
  verifyInclusion(anchor: NotarizationAnchor, proof: MerkleProof): boolean {
    return proof.root === anchor.merkleRoot && verifyMerkleProof(proof);
  }

  /**
   * Verify the anchor chain itself: each anchor's `previousAnchorHash`
   * links back, and each `anchorHash` recomputes.
   */
  verifyAnchorChain(): { ok: boolean; firstBadSeq?: number; detail?: string } {
    let expected = GENESIS_ANCHOR;
    for (const a of this.anchors) {
      if (a.previousAnchorHash !== expected) {
        return { ok: false, firstBadSeq: a.seq, detail: 'broken anchor link' };
      }
      const recomputed = anchorHashOf(a);
      if (recomputed !== a.anchorHash) {
        return { ok: false, firstBadSeq: a.seq, detail: 'anchor hash mismatch' };
      }
      expected = a.anchorHash;
    }
    return { ok: true };
  }

  /** All sealed anchors in order. */
  list(): readonly NotarizationAnchor[] {
    return this.anchors;
  }

  /** Latest anchor or undefined. */
  tip(): NotarizationAnchor | undefined {
    return this.anchors[this.anchors.length - 1];
  }
}
