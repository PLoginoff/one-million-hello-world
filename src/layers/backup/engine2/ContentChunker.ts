/**
 * Content-Defined Chunker (Rabin Fingerprint)
 *
 * Splits objects into variable-size blocks at content-determined
 * boundaries, so inserting one byte near the front shifts only the
 * surrounding chunk instead of every block's hash — the core dedup
 * trick that makes incremental backups cheap. Fixed-size blocking (the
 * executor's default) loses all dedup on unaligned inserts.
 *
 * Algorithm: a rolling 48-bit Rabin fingerprint over a 32-byte window;
 * a boundary is cut when `fingerprint & mask === 0`. Mask = 2^13−1
 * targets ~8 KiB average chunks. Min/max chunk sizes bound variance.
 *
 * Deterministic: same content ⇒ same boundaries ⇒ same chunk hashes.
 *
 * @module BackupLayer/Engine2
 */

import { sha256 } from '../engines/types';

export interface Chunk {
  readonly hash: string;
  readonly data: Buffer;
  readonly offset: number;
  readonly length: number;
}

export interface ChunkerConfig {
  /** Minimum chunk size — avoids pathological tiny chunks. */
  readonly minBytes?: number;
  /** Target average — determines the boundary mask. */
  readonly avgBytes?: number;
  /** Hard maximum — chunk is cut regardless of fingerprint. */
  readonly maxBytes?: number;
  readonly windowBytes?: number;
}

const DEFAULTS = {
  minBytes: 2048,
  avgBytes: 8192,
  maxBytes: 32768,
  windowBytes: 32,
} as const;

/**
 * Rabin polynomial — a randomly chosen degree-48 irreducible
 * polynomial, standard for LBFS/restic-style chunking.
 */
const POLY = 0x3da3358b4dc173n;
const POLY_DEG = 48;
const POLY_SHIFT = POLY_DEG - 8;

/**
 * Byte→fingerprint contribution table, computed once at module load —
 * the classic table-driven Rabin update (avoids per-byte polynomial
 * long division).
 */
const TABLE: bigint[] = (() => {
  const t: bigint[] = new Array(256);
  for (let b = 0; b < 256; b++) {
    let fp = BigInt(b) << BigInt(POLY_SHIFT);
    for (let i = 0; i < 8; i++) {
      fp = fp & (1n << BigInt(POLY_DEG - 1)) ? (fp << 1n) ^ POLY : fp << 1n;
    }
    t[b] = fp;
  }
  return t;
})();

function byteMask(avgBytes: number): bigint {
  // Largest power-of-two ≤ avgBytes; boundary when fingerprint % 2^k == 0.
  let k = 1;
  while (k * 2 <= avgBytes) k *= 2;
  return BigInt(k - 1);
}

/** Rolling window state — fingerprint over the last `windowBytes`. */
class RabinWindow {
  private readonly _w: number;
  private _fp = 0n;
  private _buf: number[];
  private _pos = 0;

  constructor(windowBytes: number) {
    this._w = windowBytes;
    this._buf = new Array(windowBytes).fill(0);
  }

  get fingerprint(): bigint {
    return this._fp;
  }

  /** Slide one byte in; the oldest byte rolls out. */
  roll(input: number): bigint {
    const out = this._buf[this._pos];
    this._buf[this._pos] = input;
    this._pos = (this._pos + 1) % this._w;
    // fp = fp ^ table[outByteContribution], then incorporate the input.
    // Contribution of the outgoing byte decays by window position; the
    // table encodes its whole-window effect so removal is O(1).
    this._fp = this._fp ^ TABLE[out];
    this._fp = (this._fp << 8n) | BigInt(input);
    this._fp &= (1n << BigInt(POLY_DEG)) - 1n;
    return this._fp;
  }

  reset(): void {
    this._fp = 0n;
    this._buf.fill(0);
    this._pos = 0;
  }
}

export class ContentDefinedChunker {
  private readonly _min: number;
  private readonly _max: number;
  private readonly _mask: bigint;
  private readonly _window: number;

  constructor(config?: ChunkerConfig) {
    this._min = config?.minBytes ?? DEFAULTS.minBytes;
    this._max = config?.maxBytes ?? DEFAULTS.maxBytes;
    this._mask = byteMask(config?.avgBytes ?? DEFAULTS.avgBytes);
    this._window = config?.windowBytes ?? DEFAULTS.windowBytes;
  }

  /**
   * Split `data` into content-defined chunks with content hashes.
   * Deterministic: identical input → identical boundaries.
   */
  chunk(data: Buffer): Chunk[] {
    if (data.length === 0) return [];
    const chunks: Chunk[] = [];
    const win = new RabinWindow(this._window);
    let chunkStart = 0;
    let i = 0;

    while (i < data.length) {
      const fp = win.roll(data[i]);
      const len = i - chunkStart + 1;
      const atBoundary =
        len >= this._min && (len >= this._max || (fp & this._mask) === 0n);
      if (atBoundary) {
        const slice = Buffer.from(data.subarray(chunkStart, i + 1));
        chunks.push({ hash: sha256(slice), data: slice, offset: chunkStart, length: len });
        chunkStart = i + 1;
        win.reset();
      }
      i++;
    }
    // Tail: whatever's left after the last boundary.
    if (chunkStart < data.length) {
      const slice = Buffer.from(data.subarray(chunkStart));
      chunks.push({
        hash: sha256(slice),
        data: slice,
        offset: chunkStart,
        length: data.length - chunkStart,
      });
    }
    return chunks;
  }

  /**
   * Split many objects and report dedup stats — the set of chunks
   * unchanged vs. `baseline` hashes.
   */
  chunkWithDedup(
    objects: ReadonlyMap<string, Buffer>,
    baselineHashes: ReadonlySet<string>
  ): { chunks: Chunk[]; deduplicated: number; fresh: number } {
    const all: Chunk[] = [];
    let deduped = 0;
    let fresh = 0;
    for (const [, data] of objects) {
      for (const c of this.chunk(data)) {
        all.push(c);
        if (baselineHashes.has(c.hash)) deduped++;
        else fresh++;
      }
    }
    return { chunks: all, deduplicated: deduped, fresh };
  }
}
