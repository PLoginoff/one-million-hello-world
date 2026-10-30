/**
 * RLE Codec Tests
 *
 * Covers run detection, escape sequences for literal ESCAPE bytes,
 * literal-run chunking, and bounded worst-case expansion.
 */

import { describe, it, expect } from 'bun:test';
import { RleCodec, ESCAPE, MIN_RUN, MAX_RUN } from '../rle/RleCodec';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('RleCodec', () => {
  const codec = new RleCodec();

  describe('round-trip', () => {
    it.each([
      '',
      'a',
      'ab',
      'aaaa',
      'aaabbbccc',
      'aabbaabb',
      'the quick brown fox jumps over the lazy dog',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    ])('should round-trip %j', (text) => {
      const encoded = codec.encodeString(text);
      expect(codec.decodeToString(encoded.data)).toBe(text);
    });

    it('should round-trip a long single-byte run', () => {
      const data = new Uint8Array(1000).fill(0x55);
      const encoded = codec.encode(data);
      expect(codec.decode(encoded.data)).toEqual(data);
      // 1000 bytes → ceil(1000/255) = 4 run tokens × 3 bytes + 6 header.
      expect(encoded.data.length).toBeLessThan(30);
    });

    it('should round-trip runs longer than MAX_RUN via multiple tokens', () => {
      const data = new Uint8Array(MAX_RUN * 2 + 7).fill(0x99);
      const encoded = codec.encode(data);
      expect(encoded.runCount).toBeGreaterThanOrEqual(2);
      expect(codec.decode(encoded.data)).toEqual(data);
    });

    it('should round-trip data containing ESCAPE bytes', () => {
      const data = new Uint8Array([0x41, ESCAPE, 0x42, ESCAPE, ESCAPE, 0x43]);
      expect(codec.decode(codec.encode(data).data)).toEqual(data);
    });

    it('should round-trip runs of ESCAPE bytes', () => {
      const data = new Uint8Array(50).fill(ESCAPE);
      expect(codec.decode(codec.encode(data).data)).toEqual(data);
    });

    it('should round-trip all 256 byte values including ESCAPE', () => {
      const data = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        data[i] = i;
      }
      expect(codec.decode(codec.encode(data).data)).toEqual(data);
    });

    it('should round-trip random data (worst case)', () => {
      let state = 4242;
      const data = new Uint8Array(512);
      for (let i = 0; i < 512; i++) {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        data[i] = state & 0xfe; // avoid ESCAPE to test pure literal path
      }
      const encoded = codec.encode(data);
      expect(codec.decode(encoded.data)).toEqual(data);
      // Bounded expansion: header + literal-run markers only.
      expect(encoded.data.length).toBeLessThan(data.length * 1.05);
    });

    it('should round-trip random data containing ESCAPE bytes', () => {
      let state = 777;
      const data = new Uint8Array(1024);
      for (let i = 0; i < 1024; i++) {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        data[i] = state & 0xff; // full range incl. 0xff
      }
      expect(codec.decode(codec.encode(data).data)).toEqual(data);
    });
  });

  describe('encoding correctness', () => {
    it('should emit a run token for runs >= MIN_RUN', () => {
      const encoded = codec.encode(new Uint8Array([1, 1, 1, 1, 1]));
      expect(encoded.runCount).toBe(1);
      // Payload: ESCAPE count value = 3 bytes.
      expect(encoded.data.length).toBe(6 + 3);
      expect(encoded.data[6]).toBe(ESCAPE);
      expect(encoded.data[7]).toBe(5);
      expect(encoded.data[8]).toBe(1);
    });

    it('should emit literal-runs for sub-MIN_RUN repeats', () => {
      const data = new Uint8Array([1, 1, 2, 3]); // run of 2 < MIN_RUN=3
      const encoded = codec.encode(data);
      expect(encoded.runCount).toBe(0);
      // Literal-run: ESCAPE 0 count + 4 bytes.
      expect(encoded.data[6]).toBe(ESCAPE);
      expect(encoded.data[7]).toBe(0);
      expect(encoded.data[8]).toBe(4);
    });

    it('should double up a literal ESCAPE byte', () => {
      const data = new Uint8Array([ESCAPE]);
      const encoded = codec.encode(data);
      // Single ESCAPE → ESCAPE ESCAPE inside a literal-run.
      expect(codec.decode(encoded.data)).toEqual(data);
    });

    it('should compress a run of ESCAPE bytes as a real run when >= MIN_RUN', () => {
      const data = new Uint8Array(10).fill(ESCAPE);
      const encoded = codec.encode(data);
      expect(encoded.runCount).toBe(1);
      // ESCAPE 10 ESCAPE
      expect(encoded.data[6]).toBe(ESCAPE);
      expect(encoded.data[7]).toBe(10);
      expect(encoded.data[8]).toBe(ESCAPE);
    });
  });

  describe('malformed input', () => {
    it('should reject short streams', () => {
      expect(() => codec.decode(new Uint8Array([1, 2]))).toThrow(/too short/);
    });

    it('should reject bad magic', () => {
      expect(() => codec.decode(new Uint8Array([0, 0, 0, 0, 0, 0]))).toThrow(/bad magic/);
    });

    it('should reject truncated escape at end', () => {
      const encoded = codec.encodeString('hello');
      const corrupt = encoded.data.subarray(0, encoded.data.length - 1);
      corrupt[corrupt.length - 1] = ESCAPE; // dangling escape
      expect(() => codec.decode(corrupt)).toThrow();
    });

    it('should reject truncated literal-run payload', () => {
      // Header len=100, then ESCAPE 0 200 but no 200 bytes following.
      const corrupt = new Uint8Array([0x52, 0x4c, 100, 0, 0, 0, ESCAPE, 0, 200, 1, 2, 3]);
      expect(() => codec.decode(corrupt)).toThrow(/truncated literal-run/);
    });

    it('should reject output overrun', () => {
      // Header says 5 bytes but a run token emits 10.
      const corrupt = new Uint8Array([0x52, 0x4c, 5, 0, 0, 0, ESCAPE, 10, 0x41]);
      expect(() => codec.decode(corrupt)).toThrow(/overrun/);
    });
  });

  describe('constants', () => {
    it('MIN_RUN should be 3', () => {
      expect(MIN_RUN).toBe(3);
    });
    it('MAX_RUN should be 255', () => {
      expect(MAX_RUN).toBe(255);
    });
  });
});
