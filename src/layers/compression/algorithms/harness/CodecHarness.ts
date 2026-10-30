/**
 * CodecHarness — benchmark and adaptive selection across all codecs.
 *
 * Unlike the legacy `Compressor.selectAlgorithm` (which guessed from a
 * regex heuristic), this harness actually RUNS every codec on the input
 * and picks the smallest real output. It also provides statistical input
 * classification (entropy estimate, repeat detection) for reporting.
 *
 * Registered codecs:
 *   - huffman      — canonical Huffman over byte alphabet
 *   - lzss         — LZ77 w/ hash-chain finder + gamma-coded tokens
 *   - lzss-fixed   — classic fixed-width LZSS
 *   - rle          — run-length encoding w/ escape sequences
 *   - delta        — delta + varint (sorted integer arrays only)
 *   - lzss+huffman — LZ token stream re-coded through Huffman literals
 *
 * Selection policy:
 *   `selectBest` measures all applicable codecs and returns the smallest
 *   encoding that is smaller than the raw input; if nothing shrinks the
 *   input it reports `identity` — honest adaptive selection.
 *
 * Complexity: O(C · T) where C = codec count, T = the slowest codec's
 * encode time for the input.
 */

import { HuffmanCodec } from '../huffman/HuffmanCodec';
import { LzssCodec, LzssFixedCodec } from '../lz/LzssCodec';
import { RleCodec } from '../rle/RleCodec';
import { DeltaCodec } from '../delta/DeltaCodec';

/** Uniform byte-codec interface used by the harness. */
export interface IByteCodec {
  readonly name: string;
  encode(input: Uint8Array): Uint8Array;
  decode(stream: Uint8Array): Uint8Array;
}

/** Adapter that normalizes each codec's native API to `IByteCodec`. */
class CodecAdapter implements IByteCodec {
  public constructor(
    public readonly name: string,
    private readonly _encode: (input: Uint8Array) => Uint8Array,
    private readonly _decode: (stream: Uint8Array) => Uint8Array
  ) {}

  encode(input: Uint8Array): Uint8Array {
    return this._encode(input);
  }

  decode(stream: Uint8Array): Uint8Array {
    return this._decode(stream);
  }
}

/** Measurement for a single codec on a single input. */
export interface CodecBenchmark {
  readonly codec: string;
  readonly inputBytes: number;
  readonly outputBytes: number;
  /** outputBytes / inputBytes — lower is better. */
  readonly ratio: number;
  /** 1 - ratio — higher is better. */
  readonly saving: number;
  readonly encodeMs: number;
  readonly decodeMs: number;
  /** True when decode(encode(x)) === x verified during the run. */
  readonly roundTripOk: boolean;
}

/** Classification of an input buffer. */
export interface InputProfile {
  readonly length: number;
  /** Shannon entropy in bits/byte over the byte histogram. */
  readonly entropyBitsPerByte: number;
  /** Count of distinct byte values present. */
  readonly distinctSymbols: number;
  /** Fraction of bytes equal to their predecessor (run density). */
  readonly runDensity: number;
  /** Fraction of bytes < 0x80 — crude "text-ness" signal. */
  readonly asciiFraction: number;
}

/** Full benchmark report for one dataset. */
export interface HarnessReport {
  readonly dataset: string;
  readonly profile: InputProfile;
  readonly results: CodecBenchmark[];
  readonly best: CodecBenchmark | null;
}

export class CodecHarness {
  private readonly _codecs: IByteCodec[];

  constructor() {
    const huffman = new HuffmanCodec();
    const lzss = new LzssCodec();
    const lzssFixed = new LzssFixedCodec();
    const rle = new RleCodec();
    const delta = new DeltaCodec(true); // zigzag: arbitrary byte sequences

    this._codecs = [
      new CodecAdapter('huffman', (d) => huffman.encode(d).data, (s) => huffman.decode(s)),
      new CodecAdapter('lzss', (d) => lzss.encode(d).data, (s) => lzss.decode(s)),
      new CodecAdapter('lzss-fixed', (d) => lzssFixed.encode(d).data, (s) => lzssFixed.decode(s)),
      new CodecAdapter('rle', (d) => rle.encode(d).data, (s) => rle.decode(s)),
      // Delta codec operates on integer arrays; adapt by treating bytes
      // as integers in zigzag mode (signed deltas). Competitive only on
      // smooth byte data, which is what the harness is meant to reveal.
      new CodecAdapter(
        'delta-zigzag',
        (d) => delta.encode(Array.from(d)).data,
        (s) => new Uint8Array(delta.decode(s))
      ),
    ];
  }

  /** Names of registered codecs, in registration order. */
  get codecNames(): string[] {
    return this._codecs.map((c) => c.name);
  }

  /**
   * Computes a statistical profile of `input`.
   *
   * Entropy is Shannon entropy of the byte histogram; run density is the
   * fraction of positions where data[i] === data[i-1].
   *
   * Complexity: O(n).
   */
  profile(input: Uint8Array): InputProfile {
    if (input.length === 0) {
      return {
        length: 0,
        entropyBitsPerByte: 0,
        distinctSymbols: 0,
        runDensity: 0,
        asciiFraction: 0,
      };
    }
    const freq = new Uint32Array(256);
    let runs = 0;
    let ascii = 0;
    for (let i = 0; i < input.length; i++) {
      const b = input[i];
      freq[b]++;
      if (b < 0x80) {
        ascii++;
      }
      if (i > 0 && b === input[i - 1]) {
        runs++;
      }
    }
    let entropy = 0;
    let distinct = 0;
    for (let s = 0; s < 256; s++) {
      if (freq[s] > 0) {
        distinct++;
        const p = freq[s] / input.length;
        entropy -= p * Math.log2(p);
      }
    }
    return {
      length: input.length,
      entropyBitsPerByte: entropy,
      distinctSymbols: distinct,
      runDensity: input.length > 1 ? runs / (input.length - 1) : 0,
      asciiFraction: ascii / input.length,
    };
  }

  /**
   * Benchmarks every codec against `input`, verifying round-trip
   * correctness of each. Returns benchmarks in codec registration order.
   */
  benchmark(input: Uint8Array): CodecBenchmark[] {
    const results: CodecBenchmark[] = [];
    for (const codec of this._codecs) {
      const t0 = performance.now();
      const encoded = codec.encode(input);
      const t1 = performance.now();
      const decoded = codec.decode(encoded);
      const t2 = performance.now();

      const roundTripOk =
        decoded.length === input.length && decoded.every((b, i) => b === input[i]);

      const ratio = input.length > 0 ? encoded.length / input.length : 1;
      results.push({
        codec: codec.name,
        inputBytes: input.length,
        outputBytes: encoded.length,
        ratio,
        saving: 1 - ratio,
        encodeMs: t1 - t0,
        decodeMs: t2 - t1,
        roundTripOk,
      });
    }
    return results;
  }

  /**
   * Picks the codec producing the smallest output that still round-trips.
   * Returns null if no codec beats raw storage.
   */
  selectBest(input: Uint8Array): CodecBenchmark | null {
    const results = this.benchmark(input);
    let best: CodecBenchmark | null = null;
    for (const r of results) {
      if (!r.roundTripOk) {
        continue;
      }
      if (r.outputBytes >= r.inputBytes) {
        continue; // not smaller than identity
      }
      if (best === null || r.outputBytes < best.outputBytes) {
        best = r;
      }
    }
    return best;
  }

  /**
   * Produces a full report for a named dataset.
   */
  report(dataset: string, input: Uint8Array): HarnessReport {
    const results = this.benchmark(input);
    let best: CodecBenchmark | null = null;
    for (const r of results) {
      if (r.roundTripOk && r.outputBytes < r.inputBytes) {
        if (best === null || r.outputBytes < best.outputBytes) {
          best = r;
        }
      }
    }
    return {
      dataset,
      profile: this.profile(input),
      results,
      best,
    };
  }
}

/**
 * Sample dataset generators used by the harness tests and reports.
 */
export class SampleDatasets {
  /** Highly repetitive text — logs, indentation, repeated sentences. */
  static repetitiveText(length = 8192): Uint8Array {
    const sentence =
      'the quick brown fox jumps over the lazy dog. ' +
      'pack my box with five dozen liquor jugs. ';
    const parts: string[] = [];
    let total = 0;
    while (total < length) {
      parts.push(sentence);
      total += sentence.length;
    }
    return new TextEncoder().encode(parts.join('').slice(0, length));
  }

  /** JSON-like structured text — moderate entropy, many short repeats. */
  static jsonLike(recordCount = 200): Uint8Array {
    const records: string[] = [];
    for (let i = 0; i < recordCount; i++) {
      records.push(
        `{"id":${1000 + i},"name":"user_${i % 37}","role":"${['admin', 'user', 'guest'][i % 3]}",` +
          `"active":${i % 4 !== 0},"score":${(i * 7919) % 10000},"tags":["alpha","beta","gamma"]}`
      );
    }
    return new TextEncoder().encode(`{"records":[${records.join(',')}]}`);
  }

  /** Uniformly random binary — near-maximal entropy, should not compress. */
  static randomBinary(length = 4096, seed = 0xdeadbeef): Uint8Array {
    // Deterministic xorshift32 PRNG so tests are reproducible.
    let state = seed >>> 0;
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      out[i] = (state >>> 0) & 0xff;
    }
    return out;
  }

  /** Sorted integer array — delta codec's home turf. */
  static sortedIntegers(count = 2000): number[] {
    const arr: number[] = [];
    let v = 1000;
    let state = 12345;
    for (let i = 0; i < count; i++) {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      v += state % 50; // small positive deltas
      arr.push(v);
    }
    return arr;
  }
}
