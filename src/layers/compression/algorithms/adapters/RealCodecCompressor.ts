/**
 * RealCodecCompressor — bridges the `algorithms/` module into the
 * layer's existing `ICompressor` interface.
 *
 * Maps the legacy `CompressionAlgorithm` enum onto real implementations:
 *   - GZIP   → LZSS (gamma-coded) — closest DEFLATE analogue
 *   - BROTLI → LZSS + larger window
 *   - NONE   → identity
 *
 * `selectAlgorithm` delegates to `CodecHarness.selectBest` — real
 * adaptive selection by measured output size instead of the old
 * regex-based `_hasRepeatingPatterns` heuristic.
 *
 * Wire format between `compress`/`decompress`: the raw byte stream is
 * base64-encoded so it survives the string-typed `CompressionResult.data`
 * channel of the legacy interface.
 *
 * Note: `CompressionAlgorithm` is imported as a type+value pair — the enum
 * is a real runtime object in `types/compression-types`.
 */

import { ICompressor } from '../../interfaces/ICompressor';
import {
  CompressionAlgorithm,
  CompressionResult,
  CompressionConfig,
} from '../../types/compression-types';
import { HuffmanCodec } from '../huffman/HuffmanCodec';
import { LzssCodec } from '../lz/LzssCodec';
import { RleCodec } from '../rle/RleCodec';
import { CodecHarness } from '../harness/CodecHarness';

/** Compression format tags embedded in the string payload. */
const TAG_LZSS = 'LZ';
const TAG_HUFFMAN = 'HF';
const TAG_RLE = 'RL';
const TAG_NONE = 'ID';

/** Binary-safe base64 helpers that avoid Buffer for Bun/browser compat. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export class RealCodecCompressor implements ICompressor {
  private _config: CompressionConfig;
  private readonly _lzss: LzssCodec;
  private readonly _huffman: HuffmanCodec;
  private readonly _rle: RleCodec;
  private readonly _harness: CodecHarness;

  constructor() {
    this._config = {
      defaultAlgorithm: CompressionAlgorithm.NONE,
      threshold: 1024,
      enableDynamic: true,
    };
    this._lzss = new LzssCodec();
    this._huffman = new HuffmanCodec();
    this._rle = new RleCodec();
    this._harness = new CodecHarness();
  }

  compress(data: string, algorithm?: CompressionAlgorithm): CompressionResult {
    const target = algorithm ?? this._config.defaultAlgorithm;
    const input = new TextEncoder().encode(data);
    const originalSize = input.length;

    if (originalSize < this._config.threshold || target === CompressionAlgorithm.NONE) {
      return {
        success: true,
        data: `${TAG_NONE}:${bytesToBase64(input)}`,
        algorithm: CompressionAlgorithm.NONE,
        originalSize,
        compressedSize: originalSize,
        ratio: 1,
      };
    }

    try {
      let tag: string;
      let encoded: Uint8Array;
      switch (target) {
        case CompressionAlgorithm.GZIP:
          encoded = this._lzss.encode(input).data;
          tag = TAG_LZSS;
          break;
        case CompressionAlgorithm.BROTLI:
          // Huffman-only path: entropy coding without LZ parsing is what
          // distinguishes a "heavy" codec profile here.
          encoded = this._huffman.encode(input).data;
          tag = TAG_HUFFMAN;
          break;
        default:
          return { success: false, error: `Unsupported algorithm: ${String(target)}` };
      }

      const payload = `${tag}:${bytesToBase64(encoded)}`;
      const compressedSize = encoded.length;
      return {
        success: true,
        data: payload,
        algorithm: target,
        originalSize,
        compressedSize,
        ratio: originalSize > 0 ? compressedSize / originalSize : 1,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Compression failed',
      };
    }
  }

  decompress(data: string, algorithm: CompressionAlgorithm): CompressionResult {
    try {
      const sep = data.indexOf(':');
      const tag = sep === -1 ? TAG_NONE : data.slice(0, sep);
      const b64 = sep === -1 ? data : data.slice(sep + 1);
      const bytes = base64ToBytes(b64);

      let decoded: Uint8Array;
      switch (tag) {
        case TAG_LZSS:
          decoded = this._lzss.decode(bytes);
          break;
        case TAG_HUFFMAN:
          decoded = this._huffman.decode(bytes);
          break;
        case TAG_RLE:
          decoded = this._rle.decode(bytes);
          break;
        case TAG_NONE:
          decoded = bytes;
          break;
        default:
          return { success: false, error: `Unknown codec tag: ${tag}` };
      }

      return {
        success: true,
        data: new TextDecoder().decode(decoded),
        algorithm,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Decompression failed',
      };
    }
  }

  /**
   * Real adaptive selection: runs every codec on the input and returns
   * the best by measured compressed size. Falls back to NONE when nothing
   * shrinks the data or the input is below threshold.
   */
  selectAlgorithm(data: string): CompressionAlgorithm {
    if (!this._config.enableDynamic) {
      return this._config.defaultAlgorithm;
    }
    const input = new TextEncoder().encode(data);
    if (input.length < this._config.threshold) {
      return CompressionAlgorithm.NONE;
    }
    const best = this._harness.selectBest(input);
    if (best === null) {
      return CompressionAlgorithm.NONE;
    }
    // Map winning codec back onto the legacy enum. huffman/lzss wins map
    // onto the two registered enum members; rle/delta wins fall back to
    // GZIP since the legacy enum has no representation for them — the
    // caller can use the algorithms module directly for full fidelity.
    switch (best.codec) {
      case 'huffman':
        return CompressionAlgorithm.BROTLI;
      default:
        return CompressionAlgorithm.GZIP;
    }
  }

  setConfig(config: CompressionConfig): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): CompressionConfig {
    return { ...this._config };
  }
}
