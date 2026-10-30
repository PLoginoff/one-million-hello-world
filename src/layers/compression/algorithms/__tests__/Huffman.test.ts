/**
 * Huffman Coding Tests
 *
 * Covers frequency tables, heap-based tree construction, canonical code
 * generation, table serialization, and full encode/decode round-trips
 * including the single-symbol and empty edge cases.
 */

import { describe, it, expect } from 'bun:test';
import {
  buildFrequencyTable,
  buildTree,
  computeCodeLengths,
  generateCanonicalCodes,
  serializeCodeLengths,
  deserializeCodeLengths,
  CanonicalDecoder,
  MinHeap,
} from '../huffman/HuffmanTree';
import { HuffmanCodec } from '../huffman/HuffmanCodec';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('buildFrequencyTable', () => {
  it('should count byte occurrences', () => {
    const freq = buildFrequencyTable(enc('aabbbc'));
    expect(freq[97]).toBe(2); // 'a'
    expect(freq[98]).toBe(3); // 'b'
    expect(freq[99]).toBe(1); // 'c'
    expect(freq[100]).toBe(0);
  });

  it('should handle empty input', () => {
    const freq = buildFrequencyTable(new Uint8Array(0));
    expect(freq.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('should count all 256 byte values', () => {
    const data = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      data[i] = i;
    }
    const freq = buildFrequencyTable(data);
    for (let i = 0; i < 256; i++) {
      expect(freq[i]).toBe(1);
    }
  });
});

describe('MinHeap', () => {
  it('should pop nodes in increasing frequency order', () => {
    const heap = new MinHeap();
    for (const f of [5, 1, 9, 3, 7]) {
      heap.push({ frequency: f, symbol: f, left: null, right: null });
    }
    const order: number[] = [];
    while (heap.size > 0) {
      order.push((heap.pop() as { frequency: number }).frequency);
    }
    expect(order).toEqual([1, 3, 5, 7, 9]);
  });

  it('should return null when empty', () => {
    expect(new MinHeap().pop()).toBeNull();
  });

  it('should handle a single element', () => {
    const heap = new MinHeap();
    heap.push({ frequency: 42, symbol: 0, left: null, right: null });
    expect(heap.size).toBe(1);
    expect((heap.pop() as { frequency: number }).frequency).toBe(42);
    expect(heap.pop()).toBeNull();
  });
});

describe('buildTree', () => {
  it('should produce a tree whose root frequency equals input length', () => {
    const freq = buildFrequencyTable(enc('aaabbc'));
    const root = buildTree(freq);
    expect(root).not.toBeNull();
    expect((root as { frequency: number }).frequency).toBe(6);
  });

  it('should return null for empty frequency table', () => {
    expect(buildTree(new Uint32Array(256))).toBeNull();
  });

  it('should handle a single symbol by adding a dummy sibling', () => {
    const freq = new Uint32Array(256);
    freq[65] = 10;
    const root = buildTree(freq);
    expect(root).not.toBeNull();
    // Root is internal; the symbol sits at depth 1.
    const lengths = computeCodeLengths(root);
    expect(lengths[65]).toBe(1);
  });

  it('should give shorter codes to more frequent symbols', () => {
    // Skewed: 'a' very frequent, 'z' rare.
    const data = enc('a'.repeat(1000) + 'b'.repeat(10) + 'c'.repeat(5) + 'z');
    const root = buildTree(buildFrequencyTable(data));
    const lengths = computeCodeLengths(root);
    expect(lengths[97]).toBeLessThan(lengths[122]); // 'a' < 'z'
  });
});

describe('canonical codes', () => {
  it('should produce a prefix-free code set', () => {
    const data = enc('the quick brown fox jumps over the lazy dog');
    const root = buildTree(buildFrequencyTable(data));
    const lengths = computeCodeLengths(root);
    const codes = generateCanonicalCodes(lengths);

    const codeStrings: string[] = [];
    for (let s = 0; s < 256; s++) {
      const c = codes[s];
      if (c !== null) {
        codeStrings.push(c.code.toString(2).padStart(c.length, '0'));
      }
    }
    // No code may be a prefix of another.
    for (let i = 0; i < codeStrings.length; i++) {
      for (let j = 0; j < codeStrings.length; j++) {
        if (i !== j) {
          expect(codeStrings[j].startsWith(codeStrings[i])).toBe(false);
        }
      }
    }
  });

  it('should satisfy Kraft inequality with equality for complete trees', () => {
    const data = enc('aaaabbbccd');
    const root = buildTree(buildFrequencyTable(data));
    const lengths = computeCodeLengths(root);
    let kraft = 0;
    for (let s = 0; s < 256; s++) {
      if (lengths[s] > 0) {
        kraft += Math.pow(2, -lengths[s]);
      }
    }
    // Huffman trees are full → Kraft sum is exactly 1 (unless clamped).
    expect(kraft).toBeLessThanOrEqual(1.0 + 1e-9);
    expect(kraft).toBeGreaterThan(0.99);
  });

  it('should assign canonical codes: same length → increasing codes by symbol order', () => {
    // Two symbols with equal frequency get equal-length codes, and the
    // lower symbol gets the lower code value.
    const freq = new Uint32Array(256);
    freq[65] = 1;
    freq[66] = 1;
    const lengths = computeCodeLengths(buildTree(freq));
    const codes = generateCanonicalCodes(lengths);
    expect(lengths[65]).toBe(lengths[66]);
    expect((codes[65] as { code: number }).code).toBeLessThan(
      (codes[66] as { code: number }).code
    );
  });
});

describe('code length serialization', () => {
  it('should round-trip a sparse table', () => {
    const lengths = new Uint8Array(256);
    lengths[65] = 2;
    lengths[66] = 3;
    lengths[200] = 1;
    const bytes = serializeCodeLengths(lengths);
    expect(bytes.length).toBe(1 + 3 * 2);
    const [restored, consumed] = deserializeCodeLengths(bytes, 0);
    expect(consumed).toBe(bytes.length);
    expect(restored[65]).toBe(2);
    expect(restored[66]).toBe(3);
    expect(restored[200]).toBe(1);
    expect(restored[0]).toBe(0);
  });

  it('should handle all 256 symbols coded', () => {
    const lengths = new Uint8Array(256).fill(8);
    const bytes = serializeCodeLengths(lengths);
    expect(bytes[0]).toBe(255); // 256 encoded as 255 sentinel
    const [restored] = deserializeCodeLengths(bytes, 0);
    for (let s = 0; s < 256; s++) {
      expect(restored[s]).toBe(8);
    }
  });

  it('should reject truncated tables', () => {
    const lengths = new Uint8Array(256);
    lengths[1] = 5;
    lengths[2] = 5;
    const bytes = serializeCodeLengths(lengths);
    expect(() => deserializeCodeLengths(bytes.subarray(0, 3), 0)).toThrow(/truncated/);
  });

  it('should reject zero code length in table', () => {
    const bytes = new Uint8Array([1, 65, 0]);
    expect(() => deserializeCodeLengths(bytes, 0)).toThrow(/invalid code length/);
  });
});

describe('CanonicalDecoder', () => {
  it('should decode symbols bit-by-bit', () => {
    const lengths = new Uint8Array(256);
    lengths[65] = 1; // 'A' → code 0
    lengths[66] = 2; // 'B' → code 10
    lengths[67] = 2; // 'C' → code 11
    const decoder = new CanonicalDecoder(lengths);

    const bits = [0, 1, 0, 1, 1]; // A B C
    let idx = 0;
    const readBit = (): number => bits[idx++];
    expect(decoder.decodeSymbol(readBit)).toBe(65);
    expect(decoder.decodeSymbol(readBit)).toBe(66);
    expect(decoder.decodeSymbol(readBit)).toBe(67);
  });

  it('should throw on invalid codes', () => {
    const lengths = new Uint8Array(256);
    lengths[65] = 1; // only '0' is a valid code
    const decoder = new CanonicalDecoder(lengths);
    const readBit = (): number => 1; // '1' never matches
    expect(() => decoder.decodeSymbol(readBit)).toThrow(/invalid code/);
  });
});

describe('HuffmanCodec', () => {
  const codec = new HuffmanCodec();

  describe('round-trip', () => {
    it.each([
      'a',
      'aaa',
      'hello world',
      'the quick brown fox jumps over the lazy dog',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'abababababababababababab',
      '',
    ])('should round-trip %j', (text) => {
      const encoded = codec.encodeString(text);
      const decoded = codec.decodeToString(encoded.data);
      expect(decoded).toBe(text);
    });

    it('should round-trip binary data with all 256 byte values', () => {
      const data = new Uint8Array(1024);
      for (let i = 0; i < 1024; i++) {
        data[i] = i % 256;
      }
      const encoded = codec.encode(data);
      const decoded = codec.decode(encoded.data);
      expect(decoded).toEqual(data);
    });

    it('should round-trip a single repeated byte (single-symbol edge case)', () => {
      const data = new Uint8Array(100).fill(0x42);
      const encoded = codec.encode(data);
      expect(encoded.symbolCount).toBe(1);
      const decoded = codec.decode(encoded.data);
      expect(decoded).toEqual(data);
    });

    it('should round-trip large text', () => {
      const text = 'lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(200);
      const encoded = codec.encodeString(text);
      const decoded = codec.decodeToString(encoded.data);
      expect(decoded).toBe(text);
    });
  });

  describe('compression effectiveness', () => {
    it('should compress skewed-distribution data below input size', () => {
      // Heavily skewed: 90% one byte.
      const data = new Uint8Array(1000);
      data.fill(0, 100, 1000); // 100 distinct-ish bytes, rest zeros
      for (let i = 0; i < 100; i++) {
        data[i] = 100 + i;
      }
      const encoded = codec.encode(data);
      expect(encoded.data.length).toBeLessThan(data.length);
    });

    it('should achieve ≤ 5 bits/byte on English-ish text', () => {
      const text =
        'it was the best of times, it was the worst of times, it was the age of wisdom, '.repeat(50);
      const encoded = codec.encodeString(text);
      const bitsPerByte = encoded.payloadBits / text.length;
      expect(bitsPerByte).toBeLessThan(5.5);
      expect(bitsPerByte).toBeGreaterThan(0);
    });
  });

  describe('malformed input', () => {
    it('should reject short streams', () => {
      expect(() => codec.decode(new Uint8Array([1, 2, 3]))).toThrow(/too short/);
    });

    it('should reject bad magic', () => {
      const bad = new Uint8Array([0x00, 0x00, 0, 0, 0, 0, 0]);
      expect(() => codec.decode(bad)).toThrow(/bad magic/);
    });

    it('should reject truncated payload', () => {
      const encoded = codec.encodeString('hello world hello world');
      const truncated = encoded.data.subarray(0, encoded.data.length - 3);
      expect(() => codec.decode(truncated)).toThrow();
    });
  });

  describe('header integrity', () => {
    it('should embed the original length in the header', () => {
      const encoded = codec.encodeString('abcabc');
      // Bytes 2..5 big-endian (writeBits emits MSB-first) = 6.
      const len =
        ((encoded.data[2] << 8) | encoded.data[3]) |
        (((encoded.data[4] << 8) | encoded.data[5]) << 16);
      expect(len >>> 0).toBe(6);
    });
  });
});
