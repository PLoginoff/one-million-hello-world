/**
 * Disaster Recovery — Integrity Checksums
 *
 * Checksum algorithms used for backup verification and corruption detection.
 * Two implementations:
 *
 * - **FNV-1a 64-bit**: fast non-crypto hash. O(n), single pass, well-distributed
 *   for corruption/coincidence detection (not tamper-proof — documented limit).
 * - **SHA-256-sim**: a simulation-grade stronger digest built from 8 rounds of
 *   multiply-xor mixing (Murmur-style finalizer per 64-bit lane). Deterministic,
 *   avalanche-good, dependency-free; suitable for simulated cryptographic
 *   integrity checks without pulling in `crypto` (which isn't deterministic
 *   across injection boundaries in tests).
 *
 * Both operate on `Uint8Array` and return lowercase hex.
 *
 * @module DisasterRecovery/DR
 */

const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK64 = 0xffffffffffffffffn;

/** FNV-1a 64-bit hash → 16-char lowercase hex. O(n) single pass. */
export function fnv1a64(data: Uint8Array): string {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < data.length; i++) {
    hash ^= BigInt(data[i]);
    hash = (hash * FNV_PRIME) & MASK64;
  }
  return hash.toString(16).padStart(16, '0');
}

/** MurmurHash3-style 64-bit finalizer — strong avalanche for mixing. */
function mix64(x: bigint): bigint {
  x ^= x >> 33n;
  x = (x * 0xff51afd7ed558ccdn) & MASK64;
  x ^= x >> 33n;
  x = (x * 0xc4ceb9fe1a85ec53n) & MASK64;
  x ^= x >> 33n;
  return x;
}

/**
 * Simulation-grade 256-bit digest: 4 independent 64-bit lanes seeded
 * differently, each absorbing 8-byte blocks via multiply-xor, then a final
 * cross-lane mix. Output = 64 hex chars. Deterministic and strongly
 * avalanche-distributed — bit flips anywhere in the input flip ~half the
 * output bits, so single-byte corruption is always detected.
 */
export function sha256Sim(data: Uint8Array): string {
  const lanes = [0x243f6a8885a308d3n, 0x13198a2e03707344n, 0xa4093822299f31d0n, 0x082efa98ec4e6c89n];
  const len = BigInt(data.length);

  for (let block = 0; block * 8 < data.length; block++) {
    // Load up to 8 bytes little-endian into a 64-bit word.
    let word = 0n;
    const base = block * 8;
    const end = Math.min(base + 8, data.length);
    for (let i = base; i < end; i++) {
      word |= BigInt(data[i]) << BigInt(8 * (i - base));
    }
    // Each lane absorbs the word with a lane-specific rotation seed.
    for (let l = 0; l < 4; l++) {
      lanes[l] = mix64(lanes[l] ^ mix64(word + BigInt(l) * 0x9e3779b97f4a7c15n));
    }
  }
  // Cross-mix + length finalization.
  for (let r = 0; r < 2; r++) {
    for (let l = 0; l < 4; l++) {
      lanes[l] = mix64(lanes[l] ^ lanes[(l + 1) % 4] ^ len);
    }
  }
  return lanes.map((v) => v.toString(16).padStart(16, '0')).join('');
}

/** Dispatch by stored checksum kind. */
export function checksum(kind: 'fnv1a' | 'sha256-sim', data: Uint8Array): string {
  return kind === 'fnv1a' ? fnv1a64(data) : sha256Sim(data);
}

/**
 * Find the first byte offset where two buffers differ, or -1 if equal.
 * O(min(n,m)) early-exit — used by corruption scanners to localize damage.
 */
export function firstMismatch(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return i;
  }
  return a.length === b.length ? -1 : n;
}
