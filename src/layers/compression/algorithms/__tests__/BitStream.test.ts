/**
 * BitStream Tests
 *
 * Coverage for BitWriter / BitReader — the MSB-first primitives that
 * Huffman and LZSS build on.
 */

import { describe, it, expect } from 'bun:test';
import { BitWriter } from '../bits/BitWriter';
import { BitReader } from '../bits/BitReader';

describe('BitWriter', () => {
  describe('writeBit', () => {
    it('should pack 8 bits MSB-first into one byte', () => {
      const w = new BitWriter();
      // 0b10110001 — first bit written lands in the MSB.
      for (const b of [1, 0, 1, 1, 0, 0, 0, 1]) {
        w.writeBit(b);
      }
      const bytes = w.toBytes();
      expect(bytes.length).toBe(1);
      expect(bytes[0]).toBe(0b10110001);
    });

    it('should treat non-zero bit argument as 1', () => {
      const w = new BitWriter();
      w.writeBit(7);
      for (let i = 0; i < 7; i++) {
        w.writeBit(0);
      }
      expect(w.toBytes()[0]).toBe(0x80);
    });

    it('should spill into subsequent bytes', () => {
      const w = new BitWriter();
      for (let i = 0; i < 16; i++) {
        w.writeBit(i % 2);
      }
      const bytes = w.toBytes();
      expect(bytes.length).toBe(2);
      expect(bytes[0]).toBe(0b01010101);
      expect(bytes[1]).toBe(0b01010101);
    });
  });

  describe('writeBits', () => {
    it('should write multi-bit fields MSB-first', () => {
      const w = new BitWriter();
      w.writeBits(0b101, 3);
      w.writeBits(0b00011, 5);
      expect(w.toBytes()[0]).toBe(0b10100011);
    });

    it('should write a full 32-bit field', () => {
      const w = new BitWriter();
      w.writeBits(0xdeadbeef, 32);
      const bytes = w.toBytes();
      expect(bytes.length).toBe(4);
      expect(bytes[0]).toBe(0xde);
      expect(bytes[1]).toBe(0xad);
      expect(bytes[2]).toBe(0xbe);
      expect(bytes[3]).toBe(0xef);
    });

    it('should write a 32-bit field after pending bits', () => {
      const w = new BitWriter();
      w.writeBits(0b1111, 4);
      w.writeBits(0xaabbccdd, 32);
      const bytes = w.toBytes();
      expect(bytes.length).toBe(5);
      // 0xf then aabbccdd spread across bytes 1..4 with low nibble padded.
      expect(bytes[0]).toBe(0xfa);
      expect(bytes[1]).toBe(0xab);
      expect(bytes[2]).toBe(0xbc);
      expect(bytes[3]).toBe(0xcd);
      expect(bytes[4]).toBe(0xd0);
    });

    it('should accept count of 0 as a no-op', () => {
      const w = new BitWriter();
      w.writeBits(0xff, 0);
      expect(w.bitsWritten).toBe(0);
      expect(w.toBytes().length).toBe(0);
    });

    it('should reject counts outside [0, 32]', () => {
      const w = new BitWriter();
      expect(() => w.writeBits(0, -1)).toThrow(RangeError);
      expect(() => w.writeBits(0, 33)).toThrow(RangeError);
    });

    it('should mask value to the requested bit width', () => {
      const w = new BitWriter();
      w.writeBits(0xffff, 4); // only low 4 bits → 1111
      w.writeBits(0, 4);
      expect(w.toBytes()[0]).toBe(0xf0);
    });
  });

  describe('writeUnary', () => {
    it('should encode 0 as a single zero bit', () => {
      const w = new BitWriter();
      w.writeUnary(0);
      w.writeBits(0, 7);
      expect(w.toBytes()[0]).toBe(0x00);
    });

    it('should encode 5 as 111110', () => {
      const w = new BitWriter();
      w.writeUnary(5);
      w.writeBits(0, 2);
      expect(w.toBytes()[0]).toBe(0b11111000);
    });

    it('should handle large values spanning bytes', () => {
      const w = new BitWriter();
      w.writeUnary(20);
      const bytes = w.toBytes();
      // 20 ones then a zero: 2 full bytes of 0xff, then 4 ones + 0 + pad.
      expect(bytes[0]).toBe(0xff);
      expect(bytes[1]).toBe(0xff);
      expect((bytes[2] & 0xf0) >>> 4).toBe(0b1111);
      expect(((bytes[2] >> 3) & 1) === 0).toBe(true);
    });

    it('should reject negative values', () => {
      const w = new BitWriter();
      expect(() => w.writeUnary(-1)).toThrow(RangeError);
    });
  });

  describe('writeGamma', () => {
    it('should encode 1 as a single bit', () => {
      const w = new BitWriter();
      w.writeGamma(1); // binary '1' with no leading zeros → bit 1
      expect(w.bitsWritten).toBe(1);
      w.writeBits(0, 7);
      expect(w.toBytes()[0]).toBe(0x80);
    });

    it('should encode 2 as 010 and 3 as 011', () => {
      const w = new BitWriter();
      w.writeGamma(2); // 0 10
      w.writeGamma(3); // 0 11
      w.writeBits(0, 2);
      expect(w.toBytes()[0]).toBe(0b01001100);
    });

    it('should encode 9 as 0001001', () => {
      const w = new BitWriter();
      w.writeGamma(9); // 000 + 1001 → 7 bits: 0001001
      w.writeBit(0); // pad to byte boundary
      expect(w.toBytes()[0]).toBe(0b00010010);
    });

    it('gamma bit cost should be 2*floor(log2(v))+1', () => {
      for (const [v, bits] of [
        [1, 1],
        [2, 3],
        [3, 3],
        [4, 5],
        [9, 7],
        [255, 15],
        [256, 17],
      ] as Array<[number, number]>) {
        const w = new BitWriter();
        w.writeGamma(v);
        expect(w.bitsWritten).toBe(bits);
      }
    });

    it('should reject values < 1', () => {
      const w = new BitWriter();
      expect(() => w.writeGamma(0)).toThrow(RangeError);
      expect(() => w.writeGamma(-3)).toThrow(RangeError);
    });
  });

  describe('writeVarint', () => {
    it('should encode small values in one byte', () => {
      const w = new BitWriter();
      w.writeVarint(127);
      expect(w.toBytes()).toEqual(new Uint8Array([0x7f]));
    });

    it('should encode 300 in two bytes with continuation bit', () => {
      const w = new BitWriter();
      w.writeVarint(300); // 300 = 0b1_0101100 → groups 0xAC, 0x02
      expect(w.toBytes()).toEqual(new Uint8Array([0xac, 0x02]));
    });

    it('should byte-align before writing', () => {
      const w = new BitWriter();
      w.writeBit(1);
      w.writeVarint(5);
      const bytes = w.toBytes();
      expect(bytes[0]).toBe(0x80); // the single bit, padded
      expect(bytes[1]).toBe(0x05);
    });
  });

  describe('alignment', () => {
    it('alignToByte should pad with zeros', () => {
      const w = new BitWriter();
      w.writeBits(0b111, 3);
      w.alignToByte();
      expect(w.isByteAligned).toBe(true);
      expect(w.toBytes()[0]).toBe(0b11100000);
    });

    it('alignToByte on aligned stream is a no-op', () => {
      const w = new BitWriter();
      w.writeBits(0xab, 8);
      w.alignToByte();
      expect(w.toBytes().length).toBe(1);
    });
  });

  describe('toBytes', () => {
    it('should left-justify pending bits in final byte', () => {
      const w = new BitWriter();
      w.writeBits(0b101, 3);
      const bytes = w.toBytes();
      expect(bytes.length).toBe(1);
      expect(bytes[0]).toBe(0b10100000);
    });

    it('should produce hex dump', () => {
      const w = new BitWriter();
      w.writeBits(0xdead, 16);
      expect(w.toHexString()).toBe('de ad');
    });
  });
});

describe('BitReader', () => {
  const makeBytes = (bits: string): Uint8Array => {
    const w = new BitWriter();
    for (const c of bits) {
      w.writeBit(c === '1' ? 1 : 0);
    }
    return w.toBytes();
  };

  describe('readBit', () => {
    it('should read bits MSB-first', () => {
      const r = new BitReader(new Uint8Array([0b10110000]));
      expect(r.readBit()).toBe(1);
      expect(r.readBit()).toBe(0);
      expect(r.readBit()).toBe(1);
      expect(r.readBit()).toBe(1);
      expect(r.readBit()).toBe(0);
    });

    it('should throw at end of stream', () => {
      const r = new BitReader(new Uint8Array([0xff]));
      for (let i = 0; i < 8; i++) {
        r.readBit();
      }
      expect(() => r.readBit()).toThrow(/end of stream|end of buffer/);
    });

    it('should respect bitLimit', () => {
      const r = new BitReader(new Uint8Array([0xff, 0xff]), 4);
      for (let i = 0; i < 4; i++) {
        expect(r.readBit()).toBe(1);
      }
      expect(() => r.readBit()).toThrow();
    });
  });

  describe('readBits', () => {
    it('should read multi-bit fields MSB-first', () => {
      const r = new BitReader(new Uint8Array([0b10100011]));
      expect(r.readBits(3)).toBe(0b101);
      expect(r.readBits(5)).toBe(0b00011);
    });

    it('should read across byte boundaries', () => {
      const r = new BitReader(new Uint8Array([0xab, 0xcd]));
      expect(r.readBits(12)).toBe(0xabc);
      expect(r.readBits(4)).toBe(0xd);
    });

    it('should read a full 32-bit field', () => {
      const r = new BitReader(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
      expect(r.readBits(32)).toBe(0xdeadbeef);
    });
  });

  describe('readUnary', () => {
    it('should decode unary values', () => {
      const r = new BitReader(makeBytes('111110' + '0' + '110'));
      expect(r.readUnary()).toBe(5);
      expect(r.readUnary()).toBe(0);
      expect(r.readUnary()).toBe(2);
    });
  });

  describe('readGamma', () => {
    it('should decode gamma values', () => {
      const w = new BitWriter();
      for (const v of [1, 2, 3, 9, 17, 300]) {
        w.writeGamma(v);
      }
      const r = new BitReader(w.toBytes());
      for (const v of [1, 2, 3, 9, 17, 300]) {
        expect(r.readGamma()).toBe(v);
      }
    });
  });

  describe('readVarint', () => {
    it('should round-trip varints', () => {
      const w = new BitWriter();
      for (const v of [0, 1, 127, 128, 300, 65535, 2 ** 40]) {
        w.writeVarint(v);
      }
      const r = new BitReader(w.toBytes());
      for (const v of [0, 1, 127, 128, 300, 65535, 2 ** 40]) {
        expect(r.readVarint()).toBe(v);
      }
    });
  });

  describe('round-trip', () => {
    it('should round-trip arbitrary bit sequences', () => {
      const w = new BitWriter();
      const fields: Array<[number, number]> = [
        [0b1, 1],
        [0xff, 8],
        [0x1234, 16],
        [0b101, 3],
        [0x7fffffff, 31],
        [0b0, 1],
        [0xaa, 8],
      ];
      for (const [v, n] of fields) {
        w.writeBits(v, n);
      }
      const r = new BitReader(w.toBytes());
      for (const [v, n] of fields) {
        expect(r.readBits(n)).toBe(v >>> 0);
      }
    });
  });

  describe('stream state', () => {
    it('should track bitsRead and bitsRemaining', () => {
      const r = new BitReader(new Uint8Array([0x00, 0x00]));
      expect(r.bitsRemaining).toBe(16);
      r.readBits(5);
      expect(r.bitsRead).toBe(5);
      expect(r.bitsRemaining).toBe(11);
      expect(r.hasBits(11)).toBe(true);
      expect(r.hasBits(12)).toBe(false);
    });
  });
});
