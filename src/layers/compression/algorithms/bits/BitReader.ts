/**
 * BitReader — MSB-first bit-level input stream.
 *
 * Reads individual bits and multi-bit fields from a `Uint8Array`, consuming
 * them most-significant-bit first within each byte — the exact mirror of
 * `BitWriter`.
 *
 * An optional `bitLimit` may be supplied so a decoder can read a bitstream
 * that is embedded inside a larger byte buffer without overrun; padded bits
 * at the end of the final byte are never visible because consumers always
 * know (from headers) exactly how many symbols to decode.
 *
 * Complexity:
 *  - `readBit` / `readBits` : O(1) for count <= 32.
 *  - `readUnary`            : O(value).
 *  - `readGamma`            : O(log value).
 *  - `readVarint`           : O(log value / 7).
 */
export class BitReader {
  /** Underlying byte source. */
  private readonly _bytes: Uint8Array;

  /** Index of the byte currently being consumed. */
  private _byteIndex: number;

  /** Bit position within the current byte, 0 = MSB, 7 = LSB. */
  private _bitIndex: number;

  /** Optional cap on total readable bits (defaults to the whole buffer). */
  private readonly _bitLimit: number;

  /** Absolute number of bits consumed so far. */
  private _bitsRead: number;

  /**
   * @param bytes - Source buffer.
   * @param bitLimit - Maximum number of readable bits; defaults to
   *                   `bytes.length * 8`.
   */
  constructor(bytes: Uint8Array, bitLimit?: number) {
    this._bytes = bytes;
    this._byteIndex = 0;
    this._bitIndex = 0;
    this._bitsRead = 0;
    const maxBits = bytes.length * 8;
    this._bitLimit = bitLimit === undefined ? maxBits : Math.min(bitLimit, maxBits);
  }

  /**
   * Reads a single bit.
   *
   * @returns 0 or 1.
   * @throws Error if the stream (or bit limit) is exhausted.
   */
  readBit(): number {
    if (this._bitsRead >= this._bitLimit) {
      throw new Error('BitReader: end of stream');
    }
    if (this._byteIndex >= this._bytes.length) {
      throw new Error('BitReader: end of buffer');
    }

    const byte = this._bytes[this._byteIndex];
    const bit = (byte >>> (7 - this._bitIndex)) & 1;

    this._bitIndex++;
    this._bitsRead++;
    if (this._bitIndex === 8) {
      this._bitIndex = 0;
      this._byteIndex++;
    }
    return bit;
  }

  /**
   * Reads `count` bits (MSB-first) and returns them as an unsigned integer.
   *
   * @param count - Number of bits in [0, 32].
   * @returns Unsigned integer containing exactly `count` meaningful low bits.
   */
  readBits(count: number): number {
    if (count < 0 || count > 32) {
      throw new RangeError(`BitReader.readBits: count must be in [0, 32], got ${count}`);
    }
    let value = 0;
    for (let i = 0; i < count; i++) {
      value = (value << 1) | this.readBit();
    }
    return value >>> 0;
  }

  /**
   * Reads a unary code: counts consecutive 1 bits until a 0 terminator.
   *
   * @returns The number of 1 bits that preceded the terminator.
   */
  readUnary(): number {
    let value = 0;
    while (this.readBit() === 1) {
      value++;
      // Guard against pathological streams.
      if (value > 0x7fffffff) {
        throw new Error('BitReader.readUnary: value overflow');
      }
    }
    return value;
  }

  /**
   * Reads an Elias gamma code (mirror of `BitWriter.writeGamma`).
   *
   * @returns The decoded positive integer.
   */
  readGamma(): number {
    let zeros = 0;
    while (this.readBit() === 0) {
      zeros++;
      if (zeros > 31) {
        throw new Error('BitReader.readGamma: prefix too long');
      }
    }
    // We've already consumed the leading 1; read `zeros` more bits as the
    // low-order portion of the value.
    const low = zeros > 0 ? this.readBits(zeros) : 0;
    return ((1 << zeros) | low) >>> 0;
  }

  /**
   * Reads an unsigned varint: 7-bit groups, MSB of each byte = continuation.
   * Assumes the stream is byte-aligned at the start (mirrors `writeVarint`,
   * which aligns before writing).
   *
   * @returns The decoded non-negative integer.
   */
  readVarint(): number {
    let result = 0;
    let shift = 0;
    for (;;) {
      const byte = this.readBits(8);
      result += (byte & 0x7f) * Math.pow(2, shift);
      if ((byte & 0x80) === 0) {
        break;
      }
      shift += 7;
      if (shift > 56) {
        throw new Error('BitReader.readVarint: varint too long');
      }
    }
    return result;
  }

  /**
   * Reads a full byte at the current bit position (mirror of `writeByte`).
   */
  readByte(): number {
    return this.readBits(8);
  }

  /**
   * Discards bits until the stream is byte-aligned (mirror of `alignToByte`).
   */
  alignToByte(): void {
    while (this._bitIndex !== 0) {
      this.readBit();
    }
  }

  /**
   * Number of bits consumed so far.
   */
  get bitsRead(): number {
    return this._bitsRead;
  }

  /**
   * Number of bits still available (respecting the bit limit).
   */
  get bitsRemaining(): number {
    return this._bitLimit - this._bitsRead;
  }

  /**
   * True if at least `count` more bits can be read.
   */
  hasBits(count: number): boolean {
    return this.bitsRemaining >= count;
  }
}
