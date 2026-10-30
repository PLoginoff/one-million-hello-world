/**
 * LzssCodec — LZ77/LZSS compressor with a real hash-chain match finder.
 *
 * Token format (bit-level, MSB-first):
 *   flag bit 0  → literal:    8 raw bits follow
 *   flag bit 1  → copy token: length then distance, both Elias-gamma coded
 *
 * The copy token encodes `length` as gamma(length - minMatch + 1) and
 * `distance` as gamma(distance - 1), keeping short matches cheap. A pure
 * LZSS variant with fixed-width fields is also provided via
 * `LzssFixedCodec` below for comparison.
 *
 * Stream format:
 *   [magic "LZ" : 2][original length : 4][token bitstream]
 *
 * Complexity:
 *  - encode: O(n · maxChain · maxMatch) worst case; ~O(n) on typical text
 *  - decode: O(n) — each token emits ≥ 1 byte, copies are memmove-fast
 */

import { BitWriter } from '../bits/BitWriter';
import { BitReader } from '../bits/BitReader';
import {
  LzMatchFinder,
  DEFAULT_WINDOW_SIZE,
  DEFAULT_MIN_MATCH,
  DEFAULT_MAX_MATCH,
} from './LzMatchFinder';

const MAGIC_0 = 0x4c; // 'L'
const MAGIC_1 = 0x5a; // 'Z'

/** Token produced by the LZ parse. */
export type LzToken =
  | { readonly kind: 'literal'; readonly byte: number }
  | { readonly kind: 'copy'; readonly distance: number; readonly length: number };

/** Encode result with statistics for analysis. */
export interface LzssEncoded {
  readonly data: Uint8Array;
  readonly tokenCount: number;
  readonly literalCount: number;
  readonly copyCount: number;
  readonly payloadBits: number;
}

export class LzssCodec {
  private readonly _finder: LzMatchFinder;
  private readonly _lazy: boolean;

  /**
   * @param lazy - When true, uses lazy matching: if taking a literal now
   *               yields a longer match at pos+1, emit the literal instead.
   *               This is the zlib "greedy vs lazy" heuristic and typically
   *               improves ratio 1–3%.
   */
  constructor(windowSize: number = DEFAULT_WINDOW_SIZE, lazy = true) {
    this._finder = new LzMatchFinder(windowSize, DEFAULT_MIN_MATCH, DEFAULT_MAX_MATCH);
    this._lazy = lazy;
  }

  /**
   * Parses `input` into a token stream (literal/copy) using the hash-chain
   * match finder. Exposed publicly for testing and analysis.
   *
   * Complexity: dominated by `findLongestMatch` — see its javadoc.
   */
  tokenize(input: Uint8Array): LzToken[] {
    this._finder.reset(input);
    const tokens: LzToken[] = [];
    let pos = 0;

    while (pos < input.length) {
      // Match first — pos must not already be inside the chains or it
      // would trivially match itself with distance 0.
      const match = this._finder.findLongestMatch(pos);

      if (match === null) {
        tokens.push({ kind: 'literal', byte: input[pos] });
        this._finder.insert(pos, pos + 1);
        pos++;
        continue;
      }

      // Lazy evaluation: check whether pos+1 yields a strictly longer match.
      if (this._lazy) {
        const next = this._finder.findLongestMatch(pos + 1);
        if (next !== null && next.length > match.length) {
          tokens.push({ kind: 'literal', byte: input[pos] });
          this._finder.insert(pos, pos + 1);
          pos++;
          continue;
        }
      }

      tokens.push({ kind: 'copy', distance: match.distance, length: match.length });
      const end = pos + match.length;
      // Insert all positions covered by the match so future matches can
      // reach inside it.
      this._finder.insert(pos, end);
      pos = end;
    }
    return tokens;
  }

  /**
   * Compresses input into a self-contained gamma-coded token stream.
   */
  encode(input: Uint8Array): LzssEncoded {
    const tokens = this.tokenize(input);

    const writer = new BitWriter();
    writer.writeBits(MAGIC_0, 8);
    writer.writeBits(MAGIC_1, 8);
    writer.writeBits(input.length & 0xffff, 16);
    writer.writeBits(Math.floor(input.length / 0x10000) & 0xffff, 16);

    let literalCount = 0;
    let copyCount = 0;
    for (const token of tokens) {
      if (token.kind === 'literal') {
        writer.writeBit(0);
        writer.writeBits(token.byte, 8);
        literalCount++;
      } else {
        writer.writeBit(1);
        // gamma(len - minMatch + 1): length ≥ minMatch ⇒ value ≥ 1.
        writer.writeGamma(token.length - DEFAULT_MIN_MATCH + 1);
        // gamma(distance): distance ≥ 1.
        writer.writeGamma(token.distance);
        copyCount++;
      }
    }

    return {
      data: writer.toBytes(),
      tokenCount: tokens.length,
      literalCount,
      copyCount,
      payloadBits: writer.bitsWritten,
    };
  }

  /**
   * Decompresses a stream produced by `encode`.
   */
  decode(stream: Uint8Array): Uint8Array {
    if (stream.length < 6) {
      throw new Error('LZSS: stream too short');
    }
    if (stream[0] !== MAGIC_0 || stream[1] !== MAGIC_1) {
      throw new Error('LZSS: bad magic');
    }
    // Header length fields are emitted MSB-first by writeBits → big-endian.
    const originalLength =
      ((stream[2] << 8) | stream[3]) | (((stream[4] << 8) | stream[5]) << 16) >>> 0;
    const reader = new BitReader(stream.subarray(6));
    const out = new Uint8Array(originalLength);
    let pos = 0;

    while (pos < originalLength) {
      const flag = reader.readBit();
      if (flag === 0) {
        out[pos++] = reader.readBits(8);
      } else {
        const length = reader.readGamma() + DEFAULT_MIN_MATCH - 1;
        const distance = reader.readGamma();
        if (distance > pos) {
          throw new Error(`LZSS: distance ${distance} beyond output position ${pos}`);
        }
        if (pos + length > originalLength) {
          throw new Error('LZSS: copy overruns declared output length');
        }
        // Byte-by-byte copy handles overlapping matches (distance < length),
        // which are legal and used for RLE-style repetitions.
        const src = pos - distance;
        for (let i = 0; i < length; i++) {
          out[pos] = out[src + i];
          pos++;
        }
      }
    }
    return out;
  }

  encodeString(text: string): LzssEncoded {
    return this.encode(new TextEncoder().encode(text));
  }

  decodeToString(stream: Uint8Array): string {
    return new TextDecoder().decode(this.decode(stream));
  }
}

/**
 * LzssFixedCodec — classic LZSS variant with fixed-width binary fields.
 *
 * Format: flag bit, then literal = 8 raw bits, copy = fixed-width
 * length field + fixed-width distance field. Simpler than the gamma
 * variant; better on large-window workloads where gamma codes get long,
 * worse on small files where fixed fields waste bits.
 *
 * Field widths derive from the window and max-match parameters:
 *   distanceBits = log2(windowSize)
 *   lengthBits   = ceil(log2(maxMatch - minMatch + 1))
 */
export class LzssFixedCodec {
  private readonly _finder: LzMatchFinder;
  private readonly _distanceBits: number;
  private readonly _lengthBits: number;
  private readonly _minMatch: number;
  private readonly _maxMatch: number;

  constructor(
    windowSize: number = DEFAULT_WINDOW_SIZE,
    minMatch: number = DEFAULT_MIN_MATCH,
    maxMatch: number = DEFAULT_MAX_MATCH
  ) {
    this._finder = new LzMatchFinder(windowSize, minMatch, maxMatch);
    this._distanceBits = Math.log2(windowSize);
    this._lengthBits = Math.ceil(Math.log2(maxMatch - minMatch + 2));
    this._minMatch = minMatch;
    this._maxMatch = maxMatch;
  }

  encode(input: Uint8Array): LzssEncoded {
    this._finder.reset(input);
    const writer = new BitWriter();
    writer.writeBits(0x4c, 8); // 'L'
    writer.writeBits(0x46, 8); // 'F'
    writer.writeBits(input.length & 0xffff, 16);
    writer.writeBits(Math.floor(input.length / 0x10000) & 0xffff, 16);

    let pos = 0;
    let literalCount = 0;
    let copyCount = 0;

    while (pos < input.length) {
      const match = this._finder.findLongestMatch(pos);
      if (match === null) {
        writer.writeBit(0);
        writer.writeBits(input[pos], 8);
        literalCount++;
        this._finder.insert(pos, pos + 1);
        pos++;
      } else {
        writer.writeBit(1);
        writer.writeBits(match.length - this._minMatch, this._lengthBits);
        writer.writeBits(match.distance - 1, this._distanceBits);
        copyCount++;
        const end = pos + match.length;
        this._finder.insert(pos, end);
        pos = end;
      }
    }

    return {
      data: writer.toBytes(),
      tokenCount: literalCount + copyCount,
      literalCount,
      copyCount,
      payloadBits: writer.bitsWritten,
    };
  }

  decode(stream: Uint8Array): Uint8Array {
    if (stream.length < 6 || stream[0] !== 0x4c || stream[1] !== 0x46) {
      throw new Error('LZSS-fixed: bad header');
    }
    const originalLength =
      ((stream[2] << 8) | stream[3]) | (((stream[4] << 8) | stream[5]) << 16) >>> 0;
    const reader = new BitReader(stream.subarray(6));
    const out = new Uint8Array(originalLength);
    let pos = 0;

    while (pos < originalLength) {
      const flag = reader.readBit();
      if (flag === 0) {
        out[pos++] = reader.readBits(8);
      } else {
        const length = reader.readBits(this._lengthBits) + this._minMatch;
        const distance = reader.readBits(this._distanceBits) + 1;
        if (distance > pos || pos + length > originalLength) {
          throw new Error('LZSS-fixed: corrupt token');
        }
        const src = pos - distance;
        for (let i = 0; i < length; i++) {
          out[pos] = out[src + i];
          pos++;
        }
      }
    }
    return out;
  }
}
