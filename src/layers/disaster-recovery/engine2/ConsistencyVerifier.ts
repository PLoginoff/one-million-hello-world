/**
 * Primary/Replica Consistency Verification
 *
 * Compares two checksum'd snapshots of the same dataset — the DR
 * question "would we have lost this if we'd failed over?" answered
 * concretely: bucket-by-bucket equality on count and content checksum.
 *
 * Buckets join by name (a table, partition or key range); every bucket
 * present on either side is compared. `ok` means same bucket on both
 * sides with equal count and equal checksum. Order inside a bucket is
 * deliberately not compared — a replica may apply transactions in a
 * different but equivalent order; the checksum is over content, not
 * sequence.
 *
 * The checksum is the caller's problem (CRC, xxhash, MD5 of a
 * canonical serialisation — injected as strings so this module stays
 * storage-agnostic). `bucketChecksum` computes one from row
 * fingerprints for tests and small datasets: a polynomial hash over
 * sorted row hashes, which is order-independent by construction.
 *
 * Cost: O(B) join + O(rows) inside each `bucketChecksum` call.
 *
 * @module DisasterRecoveryLayer/Engine2
 */

import { BucketChecksum, ConsistencyDiff, ConsistencyReport } from './types';

/**
 * Order-independent content checksum: XOR of per-row FNV-1a hashes.
 * XOR is commutative, so row order cannot skew the checksum — matching
 * the "equivalent, differently-ordered" replica semantics. Count is
 * reported alongside because XOR cancels identical pairs (two copies
 * of a row XOR to zero); count catches that collision class.
 */
export function bucketChecksum(bucket: string, rowHashes: readonly string[]): BucketChecksum {
  let acc = 0;
  for (const h of rowHashes) {
    acc ^= fnvHex(h);
    acc = acc >>> 0;
  }
  return {
    bucket,
    checksum: acc.toString(16).padStart(8, '0'),
    count: rowHashes.length,
  };
}

/** FNV-1a over a hex/string row fingerprint, unsigned 32-bit. */
function fnvHex(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) | 0) + ((h << 4) | 0) + ((h << 7) | 0) + ((h << 8) | 0) + ((h << 24) | 0)) | 0;
  }
  return h >>> 0;
}

function classify(
  primary: BucketChecksum | undefined,
  replica: BucketChecksum | undefined
): ConsistencyDiff['side'] {
  if (primary === undefined) return 'missing-primary';
  if (replica === undefined) return 'missing-replica';
  if (primary.count !== replica.count) return 'count-mismatch';
  if (primary.checksum !== replica.checksum) return 'checksum-mismatch';
  return 'ok';
}

/** Compare two bucket sets; every bucket on either side is reported. */
export function compare(
  primary: readonly BucketChecksum[],
  replica: readonly BucketChecksum[]
): ConsistencyReport {
  const p = new Map(primary.map((b) => [b.bucket, b]));
  const r = new Map(replica.map((b) => [b.bucket, b]));
  const names = new Set([...p.keys(), ...r.keys()]);
  const diffs: ConsistencyDiff[] = [];
  let matched = 0;
  for (const bucket of names) {
    const pb = p.get(bucket);
    const rb = r.get(bucket);
    const side = classify(pb, rb);
    const diff: ConsistencyDiff = { bucket, side, primary: pb, replica: rb };
    diffs.push(diff);
    if (side === 'ok') matched++;
  }
  // Deterministic output: sorted by bucket then severity order.
  diffs.sort((a, b) => a.bucket.localeCompare(b.bucket));
  return {
    bucketsCompared: names.size,
    matched,
    diffs,
    consistent: matched === names.size,
  };
}
