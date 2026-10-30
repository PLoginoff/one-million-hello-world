/**
 * LZ77/LZSS Tests
 *
 * Covers the hash-chain match finder, tokenization, and both the
 * gamma-coded and fixed-width LZSS codecs.
 */

import { describe, it, expect } from 'bun:test';
import {
  LzMatchFinder,
  DEFAULT_WINDOW_SIZE,
  DEFAULT_MIN_MATCH,
  DEFAULT_MAX_MATCH,
} from '../lz/LzMatchFinder';
import { LzssCodec, LzssFixedCodec } from '../lz/LzssCodec';
import { BitWriter } from '../bits/BitWriter';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('LzMatchFinder', () => {
  it('should reject non-power-of-two window sizes', () => {
    expect(() => new LzMatchFinder(1000)).toThrow(RangeError);
  });

  it('should reject minMatch < 3', () => {
    expect(() => new LzMatchFinder(4096, 2)).toThrow(RangeError);
  });

  it('should find an exact repeated substring', () => {
    const data = enc('abcdefghabcdefgh');
    const finder = new LzMatchFinder();
    finder.reset(data);
    finder.insert(0, 8);
    const match = finder.findLongestMatch(8);
    expect(match).not.toBeNull();
    expect((match as { distance: number }).distance).toBe(8);
    expect((match as { length: number }).length).toBe(8);
  });

  it('should return null when no match of minMatch exists', () => {
    const data = enc('abcdefghijklmnop');
    const finder = new LzMatchFinder();
    finder.reset(data);
    finder.insert(0, 8);
    expect(finder.findLongestMatch(8)).toBeNull();
  });

  it('should find overlapping matches (distance < length)', () => {
    const data = enc('aaaaaaaaaaaaaaaa');
    const finder = new LzMatchFinder();
    finder.reset(data);
    finder.insert(0, 1);
    const match = finder.findLongestMatch(1);
    expect(match).not.toBeNull();
    expect((match as { distance: number }).distance).toBe(1);
    expect((match as { length: number }).length).toBeGreaterThanOrEqual(DEFAULT_MIN_MATCH);
  });

  it('should not match outside the window', () => {
    const windowSize = 256;
    const finder = new LzMatchFinder(windowSize);
    // Pattern at pos 0, then 300 different bytes, pattern would recur
    // at pos 400 — but the window can only reach back 256.
    const data = new Uint8Array(500);
    for (let i = 0; i < 500; i++) {
      data[i] = i % 251; // fill with distinct-ish bytes
    }
    data[0] = 0xaa;
    data[1] = 0xbb;
    data[2] = 0xcc;
    data[400] = 0xaa;
    data[401] = 0xbb;
    data[402] = 0xcc;
    finder.reset(data);
    finder.insert(0, 400);
    const match = finder.findLongestMatch(400);
    // Distance would be 400 > windowSize 256 → no match.
    expect(match).toBeNull();
  });

  it('should find the LONGEST among multiple candidates', () => {
    // 'abc' appears at 0 (len 3), 'abcdef' at 10 (len 6).
    const data = enc('abc' + 'XXXXXXX' + 'abcdef' + 'YY' + 'abcdef');
    const finder = new LzMatchFinder();
    finder.reset(data);
    finder.insert(0, 18);
    const match = finder.findLongestMatch(18);
    expect(match).not.toBeNull();
    expect((match as { length: number }).length).toBe(6);
    expect((match as { distance: number }).distance).toBe(8);
  });

  it('should cap matches at maxMatch', () => {
    const maxMatch = 10;
    const finder = new LzMatchFinder(4096, 3, maxMatch);
    const data = enc('a'.repeat(100));
    finder.reset(data);
    finder.insert(0, 1);
    const match = finder.findLongestMatch(1);
    expect((match as { length: number }).length).toBeLessThanOrEqual(maxMatch);
  });
});

describe('LzssCodec (gamma-coded)', () => {
  const codec = new LzssCodec();

  describe('tokenize', () => {
    it('should emit literals for non-repeating input', () => {
      const tokens = codec.tokenize(enc('abcdefghij'));
      expect(tokens.every((t) => t.kind === 'literal')).toBe(true);
      expect(tokens.length).toBe(10);
    });

    it('should emit copy tokens for repeats', () => {
      const tokens = codec.tokenize(enc('abcabcabcabc'));
      const copies = tokens.filter((t) => t.kind === 'copy');
      expect(copies.length).toBeGreaterThan(0);
    });

    it('should cover the whole input with tokens', () => {
      const input = enc('the quick brown fox the quick brown fox');
      const tokens = codec.tokenize(input);
      let covered = 0;
      for (const t of tokens) {
        covered += t.kind === 'literal' ? 1 : t.length;
      }
      expect(covered).toBe(input.length);
    });
  });

  describe('round-trip', () => {
    it.each([
      '',
      'a',
      'abc',
      'hello world',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'abcabcabcabcabcabcabcabc',
      'the quick brown fox jumps over the lazy dog. '.repeat(30),
    ])('should round-trip %j', (text) => {
      const encoded = codec.encodeString(text);
      expect(codec.decodeToString(encoded.data)).toBe(text);
    });

    it('should round-trip all 256 byte values', () => {
      const data = new Uint8Array(512);
      for (let i = 0; i < 512; i++) {
        data[i] = i % 256;
      }
      expect(codec.decode(codec.encode(data).data)).toEqual(data);
    });

    it('should round-trip random binary data (expansion allowed)', () => {
      let state = 999;
      const data = new Uint8Array(512);
      for (let i = 0; i < 512; i++) {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        data[i] = state & 0xff;
      }
      const encoded = codec.encode(data);
      expect(codec.decode(encoded.data)).toEqual(data);
    });
  });

  describe('compression effectiveness', () => {
    it('should compress repetitive text well below input size', () => {
      const text = 'the quick brown fox jumps over the lazy dog. '.repeat(100);
      const encoded = codec.encodeString(text);
      expect(encoded.data.length).toBeLessThan(text.length / 3);
      expect(encoded.copyCount).toBeGreaterThan(0);
    });

    it('should compress long runs via overlapping copies', () => {
      const data = new Uint8Array(2000).fill(0x41);
      const encoded = codec.encode(data);
      // 2000 'A's: first literal + a handful of overlapping copies.
      expect(encoded.data.length).toBeLessThan(200);
    });
  });

  describe('malformed input', () => {
    it('should reject short streams', () => {
      expect(() => codec.decode(new Uint8Array([1, 2]))).toThrow(/too short/);
    });

    it('should reject bad magic', () => {
      expect(() => codec.decode(new Uint8Array([0, 0, 0, 0, 0, 0, 0]))).toThrow(/bad magic/);
    });

    it('should reject distances beyond output position', () => {
      // Craft: header len=10, then a copy token (flag=1, gamma length,
      // gamma distance) while the output is still empty — distance 5
      // cannot be satisfied at position 0.
      const w = new BitWriter();
      w.writeBits(0x4c, 8); // 'L'
      w.writeBits(0x5a, 8); // 'Z'
      w.writeBits(10 & 0xffff, 16); // length low 16 bits (BE)
      w.writeBits(0, 16); // length high 16 bits
      w.writeBit(1); // copy flag
      w.writeGamma(1); // length = minMatch + 0
      w.writeGamma(5); // distance = 5
      expect(() => codec.decode(w.toBytes())).toThrow(/beyond output position/);
    });
  });
});

describe('LzssFixedCodec', () => {
  const codec = new LzssFixedCodec();

  it('should round-trip repetitive text', () => {
    const text = 'hello hello hello hello hello world world world';
    const encoded = codec.encode(enc(text));
    expect(codec.decode(encoded.data)).toEqual(enc(text));
  });

  it('should round-trip runs', () => {
    const data = new Uint8Array(500).fill(0x7f);
    expect(codec.decode(codec.encode(data).data)).toEqual(data);
  });

  it('should round-trip mixed content', () => {
    const parts: number[] = [];
    for (let i = 0; i < 300; i++) {
      parts.push(i % 60);
    }
    const data = new Uint8Array(parts);
    expect(codec.decode(codec.encode(data).data)).toEqual(data);
  });

  it('should reject bad header', () => {
    expect(() => codec.decode(new Uint8Array([0, 0, 0, 0, 0, 0]))).toThrow(/bad header/);
  });
});
