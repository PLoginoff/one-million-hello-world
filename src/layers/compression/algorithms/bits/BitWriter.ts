/**
 * BitWriter — MSB-first bit-level output stream.
 *
 * Accumulates individual bits and multi-bit fields into a byte buffer.
 * Bits are packed most-significant-bit first within each byte, matching the
 * bit order used by DEFLATE's Huffman codes, PNG, and most network protocols.
 *
 * The writer maintains a 32-bit staging register (`_accumulator`) and a count
 * of how many low bits in that register are currently valid. Whole bytes are
 * flushed from the accumulator into the output array as soon as 8 or more
 * bits are available.
 *
 * Complexity:
 *  - `writeBit` / `writeBits` : O(1) amortized per call.
 *  - `writeUnary`             : O(value) — unary codes are inherently linear
 *                               in the encoded value.
 *  - `toBytes` / `finish`     : O(n) where n is the number of produced bytes.
 *
 * Memory: O(n) where n is the number of output bytes; the accumulator holds
 * at most 39 bits at any time (32-bit register + at most 7 pending bits).
 */
export class BitWriter {
  /** Output byte buffer. */
  private readonly _bytes: number[];

  /**
   * Staging register. Only the lowest `_bitCount` bits are meaningful.
   * New bits are appended at bit position `_bitCount` (i.e. the register
   * grows from LSB upward; we treat bit 0 as the next flush position).
   *
   * Implementation detail: we accumulate right-aligned — the oldest pending
   * bit is at position (_bitCount - 1) and the newest at position 0. When
   * _bitCount >= 8 we extract the top 8 bits as a byte.
   */
  private _accumulator: number;

  /** Number of valid bits currently held in `_accumulator`. */
  private _bitCount: number;

  /** Total number of bits written since construction (for diagnostics). */
  private _totalBitsWritten: number;

  constructor() {
    this._bytes = [];
    this._accumulator = 0;
    this._bitCount = 0;
    this._totalBitsWritten = 0;
  }

  /**
   * Writes a single bit.
   *
   * @param bit - The bit value; anything non-zero is treated as 1.
   */
  writeBit(bit: number): void {
    // Shift register up and append the new bit at position 0.
    this._accumulator = ((this._accumulator << 1) | (bit & 1)) >>> 0;
    this._bitCount++;
    this._totalBitsWritten++;

    if (this._bitCount >= 8) {
      this._flushByte();
    }
  }

  /**
   * Writes `count` low-order bits of `value`, most-significant bit first.
   *
   * For example `writeBits(0b101, 3)` emits bits 1, 0, 1 in that order.
   *
   * @param value - Source integer (only the low `count` bits are used).
   * @param count - Number of bits to write; must be in [0, 32].
   */
  writeBits(value: number, count: number): void {
    if (count < 0 || count > 32) {
      throw new RangeError(`BitWriter.writeBits: count must be in [0, 32], got ${count}`);
    }
    if (count === 0) {
      return;
    }

    // Fast path: if the whole field fits in the 32-bit register alongside the
    // pending bits, do a single merge. Otherwise fall back to per-bit writes
    // (still O(count)).
    if (this._bitCount + count <= 32) {
      const mask = count === 32 ? 0xffffffff : (1 << count) - 1;
      this._accumulator = ((this._accumulator << count) | (value & mask)) >>> 0;
      this._bitCount += count;
      this._totalBitsWritten += count;
      while (this._bitCount >= 8) {
        this._flushByte();
      }
      return;
    }

    // Slow path for a 32-bit field when some bits are already pending:
    // emit the field one bit at a time (rare, still O(count)).
    for (let i = count - 1; i >= 0; i--) {
      this.writeBit((value >>> i) & 1);
    }
  }

  /**
   * Writes a unary code: `value` one-bits followed by a single zero-bit.
   *
   * Unary coding is used by Golomb/Rice codes and by several LZ variants for
   * match-length encoding.
   *
   * Complexity: O(value) — inherent to unary representation.
   *
   * @param value - Non-negative integer to encode.
   */
  writeUnary(value: number): void {
    if (value < 0 || !Number.isInteger(value)) {
      throw new RangeError(`BitWriter.writeUnary: value must be a non-negative integer, got ${value}`);
    }
    // Emit `value` ones in bulk where possible for speed.
    let remaining = value;
    while (remaining >= 32) {
      this.writeBits(0xffffffff, 32);
      remaining -= 32;
    }
    if (remaining > 0) {
      this.writeBits((1 << remaining) - 1, remaining);
    }
    this.writeBit(0);
  }

  /**
   * Writes an Elias gamma code for `value >= 1`:
   *   floor(log2(v)) zero bits, then the binary representation of v
   *   (which begins with an implicit 1 bit that serves as the terminator).
   *
   * Gamma codes are prefix-free and used to encode LZ77 token fields such
   * as match lengths and distances.
   *
   * Complexity: O(log value).
   *
   * @param value - Positive integer (>= 1).
   */
  writeGamma(value: number): void {
    if (value < 1 || !Number.isInteger(value)) {
      throw new RangeError(`BitWriter.writeGamma: value must be a positive integer, got ${value}`);
    }
    const bits = Math.floor(Math.log2(value)) + 1; // total binary length
    // (bits - 1) leading zeros ...
    for (let i = 0; i < bits - 1; i++) {
      this.writeBit(0);
    }
    // ... then the value itself (MSB first). The MSB acts as the '1' stop bit.
    this.writeBits(value, bits);
  }

  /**
   * Writes an unsigned LEB128-style varint, but at the *bit* level each
   * group is emitted MSB-first within the stream. For simplicity and byte
   * alignment friendliness, this codec writes a full byte per group.
   *
   * Layout: 7 payload bits + 1 continuation bit per byte, continuation = 1
   * means "more groups follow".
   *
   * Complexity: O(log value / 7).
   *
   * @param value - Non-negative integer (must fit in 53 bits of precision).
   */
  writeVarint(value: number): void {
    if (value < 0 || !Number.isInteger(value)) {
      throw new RangeError(`BitWriter.writeVarint: value must be a non-negative integer, got ${value}`);
    }
    // Ensure byte alignment so each varint byte lands in its own output byte.
    this.alignToByte();
    let v = value;
    do {
      let group = v & 0x7f;
      v = Math.floor(v / 128);
      if (v > 0) {
        group |= 0x80;
      }
      this.writeBits(group, 8);
    } while (v > 0);
  }

  /**
   * Writes a raw byte. If the stream is not byte-aligned, the byte's bits
   * are spliced in at the current bit position.
   *
   * @param byte - Value in [0, 255].
   */
  writeByte(byte: number): void {
    this.writeBits(byte & 0xff, 8);
  }

  /**
   * Pads the current byte with zero bits so the stream is byte-aligned.
   * No-op if already aligned.
   */
  alignToByte(): void {
    const pad = (8 - (this._bitCount % 8)) % 8;
    for (let i = 0; i < pad; i++) {
      this.writeBit(0);
    }
  }

  /**
   * Number of whole bytes produced so far (pending partial byte not counted).
   */
  get byteLength(): number {
    return this._bytes.length;
  }

  /**
   * Total number of bits written, including those still pending in the
   * staging register.
   */
  get bitsWritten(): number {
    return this._totalBitsWritten;
  }

  /**
   * True if the stream is currently byte-aligned.
   */
  get isByteAligned(): boolean {
    return this._bitCount % 8 === 0;
  }

  /**
   * Extracts the output, padding the final partial byte with zero bits
   * (the reader relies on an explicit length header to know when to stop).
   *
   * @returns The encoded bytes as a `Uint8Array`.
   */
  toBytes(): Uint8Array {
    const out = new Uint8Array(this._bytes.length + (this._bitCount > 0 ? 1 : 0));
    for (let i = 0; i < this._bytes.length; i++) {
      out[i] = this._bytes[i];
    }
    if (this._bitCount > 0) {
      // Left-justify the pending bits in the final byte.
      out[out.length - 1] = (this._accumulator << (8 - this._bitCount)) & 0xff;
    }
    return out;
  }

  /**
   * Returns a hex dump string for debugging.
   */
  toHexString(): string {
    const bytes = this.toBytes();
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ');
  }

  /**
   * Flushes the top 8 bits of the staging register into the output.
   * Called internally whenever _bitCount >= 8.
   */
  private _flushByte(): void {
    const shift = this._bitCount - 8;
    const byte = (this._accumulator >>> shift) & 0xff;
    this._bytes.push(byte);
    // Keep the remaining low bits.
    const keepMask = shift === 0 ? 0 : (1 << shift) - 1;
    this._accumulator = this._accumulator & keepMask;
    this._bitCount -= 8;
  }
}
