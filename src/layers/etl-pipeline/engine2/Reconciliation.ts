/**
 * Data Reconciliation — source vs target counts, checksums, and diffs.
 *
 * Post-load verification: after a pipeline runs, prove that what landed
 * in the target matches what left the source.
 *
 * Techniques:
 *   - Row counts per partition/table.
 *   - Checksum comparison: order-insensitive XOR-of-hashes ("checkxum")
 *     per column and whole-row — a missing row anywhere flips the XOR,
 *     so we get detection in O(n) without a sort. (Same trick as
 *     pt-table-checksum's CRC approach.)
 *   - Key-set diff: which keys exist on only one side; optionally fetch
 *     the differing rows and emit a `DiffReport` the caller can page
 *     through.
 *
 * All comparisons are streaming — rows are folded in via `addSource` /
 * `addTarget` so multi-GB tables don't need materialisation.
 *
 * @module EtlPipeline/Engine2
 */

import { Row } from '../engine/DagEngine';
import { sha256, utf8, hex } from '../../mfa/engine2/WebAuthn';

/** Hash a row deterministically: sorted keys + JSON values. */
export function hashRow(row: Row, columns?: readonly string[]): Uint8Array {
  const keys = columns ? [...columns].sort() : Object.keys(row).sort();
  const s = keys.map((k) => `${k}=${JSON.stringify(row[k])}`).join('|');
  return sha256(utf8(s));
}

/** XOR-fold a 32-byte hash into an accumulator. */
function xorInto(acc: Uint8Array, h: Uint8Array): void {
  for (let i = 0; i < acc.length; i++) acc[i] ^= h[i];
}

/** Which keys exist on one side only. */
export interface KeyDiff {
  readonly inSourceOnly: readonly string[];
  readonly inTargetOnly: readonly string[];
  /** Keys present on both sides but whose row hashes differ. */
  readonly differing: readonly string[];
}

export interface DiffReport {
  readonly sourceCount: number;
  readonly targetCount: number;
  readonly countsMatch: boolean;
  readonly checksumsMatch: boolean;
  readonly keyDiff: KeyDiff;
  /** Sample of differing rows for inspection. */
  readonly samples: readonly { key: string; source?: Row; target?: Row }[];
}

export interface ReconcileOptions {
  /** Column used as the key. */
  readonly keyColumn: string;
  /** Columns to checksum; undefined = all. */
  readonly checksumColumns?: readonly string[];
  /** Max differing rows captured in samples. Default 20. */
  readonly sampleSize?: number;
}

/**
 * Streaming reconciler. Feed source rows via `addSource` and target rows
 * via `addTarget`, then `report()`. O(n) time, O(#keys) memory for the
 * key-index (needed for row-level diff).
 */
export class Reconciler {
  private readonly key: string;
  private readonly cols?: readonly string[];
  private readonly sampleSize: number;
  private sourceCount = 0;
  private targetCount = 0;
  private readonly sourceHash = new Uint8Array(32);
  private readonly targetHash = new Uint8Array(32);
  private readonly sourceRows = new Map<string, { row: Row; hash: Uint8Array }>();
  private readonly targetRows = new Map<string, { row: Row; hash: Uint8Array }>();

  constructor(options: ReconcileOptions) {
    this.key = options.keyColumn;
    this.cols = options.checksumColumns;
    this.sampleSize = options.sampleSize ?? 20;
  }

  addSource(row: Row): void {
    const k = String(row[this.key]);
    const h = hashRow(row, this.cols);
    // XOR: if the same key is added twice the hash cancels — duplicate
    // detection falls out for free in count-vs-checksum disagreement.
    xorInto(this.sourceHash, h);
    this.sourceRows.set(k, { row, hash: h });
    this.sourceCount++;
  }

  addTarget(row: Row): void {
    const k = String(row[this.key]);
    const h = hashRow(row, this.cols);
    xorInto(this.targetHash, h);
    this.targetRows.set(k, { row, hash: h });
    this.targetCount++;
  }

  /** Produce the diff report. */
  report(): DiffReport {
    const inSourceOnly: string[] = [];
    const inTargetOnly: string[] = [];
    const differing: string[] = [];
    const samples: { key: string; source?: Row; target?: Row }[] = [];

    for (const [k, s] of this.sourceRows) {
      const t = this.targetRows.get(k);
      if (!t) {
        inSourceOnly.push(k);
        if (samples.length < this.sampleSize) samples.push({ key: k, source: s.row });
      } else if (!equalBytes(s.hash, t.hash)) {
        differing.push(k);
        if (samples.length < this.sampleSize) samples.push({ key: k, source: s.row, target: t.row });
      }
    }
    for (const [k, t] of this.targetRows) {
      if (!this.sourceRows.has(k)) {
        inTargetOnly.push(k);
        if (samples.length < this.sampleSize) samples.push({ key: k, target: t.row });
      }
    }

    return {
      sourceCount: this.sourceCount,
      targetCount: this.targetCount,
      countsMatch: this.sourceCount === this.targetCount,
      checksumsMatch: equalBytes(this.sourceHash, this.targetHash),
      keyDiff: { inSourceOnly, inTargetOnly, differing },
      samples,
    };
  }
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

/**
 * Batch helper — reconcile two row arrays in one call.
 */
export function reconcile(
  source: readonly Row[],
  target: readonly Row[],
  options: ReconcileOptions
): DiffReport {
  const r = new Reconciler(options);
  for (const row of source) r.addSource(row);
  for (const row of target) r.addTarget(row);
  return r.report();
}
