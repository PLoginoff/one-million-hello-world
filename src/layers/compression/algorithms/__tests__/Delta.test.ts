/**
 * Delta Codec Tests
 *
 * Covers varint/zigzag primitives and both sorted-mode and zigzag-mode
 * delta encoding of integer arrays.
 */

import { describe, it, expect } from 'bun:test';
import {
  DeltaCodec,
  zigzagEncode,
  zigzagDecode,
  writeVarint,
  readVarint,
} from '../delta/DeltaCodec';

describe('zigzag', () => {
  it.each([
    [0, 0],
    [-1, 1],
    [1, 2],
    [-2, 3],
    [2, 4],
    [-100, 199],
    [100, 200],
    [-2147483648, 4294967295],
  ])('zigzagEncode(%i) = %i', (v, expected) => {
    expect(zigzagEncode(v)).toBe(expected);
  });

  it('should round-trip a range of values', () => {
    for (let v = -500; v <= 500; v++) {
      expect(zigzagDecode(zigzagEncode(v))).toBe(v);
    }
  });
});

describe('varint', () => {
  it.each([
    [0, [0]],
    [1, [1]],
    [127, [127]],
    [128, [128, 1]],
    [300, [172, 2]],
    [16384, [128, 128, 1]],
  ])('writeVarint(%i) produces expected bytes', (v, expected) => {
    const out: number[] = [];
    writeVarint(out, v);
    expect(out).toEqual(expected);
  });

  it('should round-trip large values', () => {
    for (const v of [0, 1, 127, 128, 255, 300, 65535, 2 ** 20, 2 ** 40, Number.MAX_SAFE_INTEGER]) {
      const out: number[] = [];
      writeVarint(out, v);
      const [decoded, consumed] = readVarint(new Uint8Array(out), 0);
      expect(decoded).toBe(v);
      expect(consumed).toBe(out.length);
    }
  });

  it('should reject negative or non-integer values', () => {
    const out: number[] = [];
    expect(() => writeVarint(out, -5)).toThrow(RangeError);
    expect(() => writeVarint(out, 1.5)).toThrow(RangeError);
  });

  it('should reject truncated varints', () => {
    expect(() => readVarint(new Uint8Array([0x80]), 0)).toThrow(/truncated/);
  });
});

describe('DeltaCodec (sorted mode)', () => {
  const codec = new DeltaCodec(false);

  it('should round-trip a sorted array', () => {
    const input = [5, 10, 10, 11, 15, 20, 100, 101, 105];
    const encoded = codec.encode(input);
    expect(codec.decode(encoded.data)).toEqual(input);
  });

  it('should round-trip an empty array', () => {
    const encoded = codec.encode([]);
    expect(encoded.elementCount).toBe(0);
    expect(codec.decode(encoded.data)).toEqual([]);
  });

  it('should round-trip a single element', () => {
    expect(codec.decode(codec.encode([42]).data)).toEqual([42]);
  });

  it('should round-trip negative first elements', () => {
    const input = [-1000, -500, -100, 0, 50];
    expect(codec.decode(codec.encode(input).data)).toEqual(input);
  });

  it('should compress small-delta sequences to ~1 byte/element', () => {
    const input: number[] = [];
    let v = 100000;
    for (let i = 0; i < 1000; i++) {
      v += i % 7; // small non-negative deltas
      input.push(v);
    }
    const encoded = codec.encode(input);
    expect(encoded.bytesPerElement).toBeLessThan(1.2);
    // Compare to the 4-8 bytes/element a naive encoding would cost.
    expect(encoded.data.length).toBeLessThan(input.length * 2);
  });

  it('should reject unsorted input in sorted mode', () => {
    expect(() => codec.encode([5, 3, 9])).toThrow(/not sorted/);
  });
});

describe('DeltaCodec (zigzag mode)', () => {
  const codec = new DeltaCodec(true);

  it('should round-trip arrays with negative deltas', () => {
    const input = [100, 90, 95, 80, 120, 60, 60, 200];
    expect(codec.decode(codec.encode(input).data)).toEqual(input);
  });

  it('should round-trip sawtooth patterns', () => {
    const input: number[] = [];
    for (let i = 0; i < 500; i++) {
      input.push((i % 25) * 4); // rises then drops sharply
    }
    expect(codec.decode(codec.encode(input).data)).toEqual(input);
  });

  it('should compress smooth random walks well', () => {
    let v = 0;
    let state = 31337;
    const input: number[] = [];
    for (let i = 0; i < 2000; i++) {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      v += (state % 21) - 10; // deltas in [-10, 10] → zigzag ≤ 20 → 1 byte
      input.push(v);
    }
    const encoded = codec.encode(input);
    expect(encoded.bytesPerElement).toBeLessThan(1.2);
    expect(codec.decode(encoded.data)).toEqual(input);
  });

  it('mode flag should be stored in the stream, not the instance', () => {
    const sorted = new DeltaCodec(false);
    const stream = codec.encode([10, 5, 15]).data; // zigzag stream
    // Decoding with a sorted-mode instance still works: flag lives in stream.
    expect(sorted.decode(stream)).toEqual([10, 5, 15]);
  });
});

describe('DeltaCodec (shared)', () => {
  it('isSorted should detect sorted and unsorted arrays', () => {
    expect(DeltaCodec.isSorted([1, 2, 2, 5])).toBe(true);
    expect(DeltaCodec.isSorted([1, 5, 3])).toBe(false);
    expect(DeltaCodec.isSorted([])).toBe(true);
    expect(DeltaCodec.isSorted([7])).toBe(true);
  });

  it('should reject short streams', () => {
    const codec = new DeltaCodec();
    expect(() => codec.decode(new Uint8Array([1, 2, 3]))).toThrow(/too short/);
  });

  it('should reject bad magic', () => {
    const codec = new DeltaCodec();
    expect(() => codec.decode(new Uint8Array([0, 0, 0, 0, 0, 0, 0]))).toThrow(/bad magic/);
  });
});
