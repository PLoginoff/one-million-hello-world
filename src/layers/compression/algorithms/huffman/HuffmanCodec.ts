/**
 * HuffmanCodec — byte-oriented Huffman compressor/decompressor.
 *
 * Self-contained stream format (all integers little-endian unless noted):
 *
 *   Header:
 *     [magic "HF"      : 2 bytes]
 *     [original length : 4 bytes]
 *     [code-length tbl : variable — see serializeCodeLengths]
 *   Payload:
 *     [bitstream of canonical Huffman codes, MSB-first within each byte,
 *      final byte zero-padded]
 *
 * The decoder reconstructs canonical codes from the length table, then
 * decodes exactly `original length` symbols — so zero-padding in the last
 * byte is never mistaken for data.
 *
 * Complexity:
 *  - encode: O(n + k log k)  (n = input bytes, k = distinct symbols ≤ 256)
 *  - decode: O(n · L)        (L = max code length ≤ 32)
 */

import { BitWriter } from '../bits/BitWriter';
import { BitReader } from '../bits/BitReader';
import {
  buildFrequencyTable,
  buildTree,
  computeCodeLengths,
  generateCanonicalCodes,
  serializeCodeLengths,
  deserializeCodeLengths,
  CanonicalDecoder,
} from './HuffmanTree';

const MAGIC_0 = 0x48; // 'H'
const MAGIC_1 = 0x46; // 'F'

/** Result of a Huffman encode pass. */
export interface HuffmanEncoded {
  /** Complete self-contained stream (header + payload). */
  readonly data: Uint8Array;
  /** Number of bits in the payload (excluding padding). */
  readonly payloadBits: number;
  /** Distinct symbols that were assigned codes. */
  readonly symbolCount: number;
}

export class HuffmanCodec {
  /**
   * Compresses `input` into a self-contained Huffman stream.
   *
   * Empty input produces a header-only stream that decodes back to empty.
   */
  encode(input: Uint8Array): HuffmanEncoded {
    const frequencies = buildFrequencyTable(input);
    const root = buildTree(frequencies);
    const lengths = computeCodeLengths(root);
    const codes = generateCanonicalCodes(lengths);
    const table = serializeCodeLengths(lengths);

    const writer = new BitWriter();
    const payload = new BitWriter();

    let symbolCount = 0;
    for (let s = 0; s < 256; s++) {
      if (codes[s] !== null) {
        symbolCount++;
      }
    }

    // Header — raw bytes, so keep the writer byte-aligned throughout.
    writer.writeBits(MAGIC_0, 8);
    writer.writeBits(MAGIC_1, 8);
    writer.writeBits(input.length & 0xffff, 16);
    writer.writeBits(Math.floor(input.length / 0x10000) & 0xffff, 16);
    for (let i = 0; i < table.length; i++) {
      writer.writeByte(table[i]);
    }

    // Payload.
    for (let i = 0; i < input.length; i++) {
      const code = codes[input[i]];
      if (code === null) {
        // Unreachable in practice: every occurring symbol got a code.
        throw new Error(`Huffman: no code for symbol ${input[i]}`);
      }
      payload.writeBits(code.code, code.length);
    }

    const headerBytes = writer.toBytes();
    const payloadBytes = payload.toBytes();
    const data = new Uint8Array(headerBytes.length + payloadBytes.length);
    data.set(headerBytes, 0);
    data.set(payloadBytes, headerBytes.length);

    return { data, payloadBits: payload.bitsWritten, symbolCount };
  }

  /**
   * Decompresses a stream produced by `encode`.
   *
   * @throws Error on malformed headers or truncated payloads.
   */
  decode(stream: Uint8Array): Uint8Array {
    if (stream.length < 6) {
      throw new Error('Huffman: stream too short');
    }
    if (stream[0] !== MAGIC_0 || stream[1] !== MAGIC_1) {
      throw new Error('Huffman: bad magic');
    }
    // Length fields were written MSB-first (big-endian) by writeBits.
    const originalLength =
      ((stream[2] << 8) | stream[3]) | (((stream[4] << 8) | stream[5]) << 16) >>> 0;
    const [lengths, tableBytes] = deserializeCodeLengths(stream, 6);
    const payloadStart = 6 + tableBytes;

    if (originalLength === 0) {
      return new Uint8Array(0);
    }
    if (payloadStart >= stream.length) {
      throw new Error('Huffman: missing payload');
    }

    const decoder = new CanonicalDecoder(lengths);
    const payload = stream.subarray(payloadStart);
    const reader = new BitReader(payload);
    const boundRead = (): number => reader.readBit();

    const out = new Uint8Array(originalLength);
    for (let i = 0; i < originalLength; i++) {
      out[i] = decoder.decodeSymbol(boundRead);
    }
    return out;
  }

  /**
   * Convenience: compress a UTF-8 string.
   */
  encodeString(text: string): HuffmanEncoded {
    return this.encode(new TextEncoder().encode(text));
  }

  /**
   * Convenience: decompress back to a UTF-8 string.
   */
  decodeToString(stream: Uint8Array): string {
    return new TextDecoder().decode(this.decode(stream));
  }
}
