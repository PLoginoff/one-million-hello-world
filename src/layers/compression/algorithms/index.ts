/**
 * Compression Algorithms Module
 *
 * Real compression algorithm implementations replacing the layer's
 * simulated codecs:
 *
 *   bits/     — MSB-first BitWriter/BitReader primitives
 *   huffman/  — canonical Huffman coding with real tree + heap
 *   lz/       — LZ77/LZSS with hash-chain match finder
 *   rle/      — run-length encoding with escape sequences
 *   delta/    — delta + varint (and zigzag) encoding for integer arrays
 *   harness/  — codec benchmark + adaptive selection
 *   adapters/ — bridge into the legacy ICompressor interface
 *
 * All implementations are pure TypeScript with no external dependencies.
 *
 * @module CompressionAlgorithms
 */

export { BitWriter } from './bits/BitWriter';
export { BitReader } from './bits/BitReader';

export { HuffmanCodec } from './huffman/HuffmanCodec';
export type { HuffmanEncoded } from './huffman/HuffmanCodec';
export {
  buildFrequencyTable,
  buildTree,
  computeCodeLengths,
  generateCanonicalCodes,
  serializeCodeLengths,
  deserializeCodeLengths,
  CanonicalDecoder,
  MinHeap,
  MAX_CODE_LENGTH,
} from './huffman/HuffmanTree';
export type { HuffmanNode, CanonicalCode } from './huffman/HuffmanTree';

export { LzssCodec, LzssFixedCodec } from './lz/LzssCodec';
export type { LzToken, LzssEncoded } from './lz/LzssCodec';
export {
  LzMatchFinder,
  DEFAULT_WINDOW_SIZE,
  DEFAULT_MIN_MATCH,
  DEFAULT_MAX_MATCH,
  DEFAULT_MAX_CHAIN,
} from './lz/LzMatchFinder';
export type { LzMatch } from './lz/LzMatchFinder';

export { RleCodec, ESCAPE, MIN_RUN, MAX_RUN } from './rle/RleCodec';
export type { RleEncoded } from './rle/RleCodec';

export { DeltaCodec, zigzagEncode, zigzagDecode, writeVarint, readVarint } from './delta/DeltaCodec';
export type { DeltaEncoded } from './delta/DeltaCodec';

export { CodecHarness, SampleDatasets } from './harness/CodecHarness';
export type {
  IByteCodec,
  CodecBenchmark,
  InputProfile,
  HarnessReport,
} from './harness/CodecHarness';

export { RealCodecCompressor } from './adapters/RealCodecCompressor';
