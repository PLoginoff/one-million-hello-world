/**
 * ByteWriter / ByteReader — growable write buffer + bounded read cursor.
 *
 * The codec's I/O primitives. Writer amortizes `push` by doubling a
 * `Uint8Array` backing store (append O(1) amortized, like ArrayList);
 * reader tracks a cursor over a fixed buffer and exposes `remaining` so
 * the streaming decoder knows exactly how much of a record is buffered.
 *
 * Both are deliberately synchronous — the codec never blocks; partial
 * input is handled by the caller retaining unconsumed bytes.
 *
 * @module SerializationLayer/Engine
 */

export class ByteWriter {
  private buf: Uint8Array;
  private len = 0;

  constructor(initialCapacity = 256) {
    this.buf = new Uint8Array(initialCapacity);
  }

  get size(): number {
    return this.len;
  }

  private ensure(extra: number): void {
    if (this.len + extra <= this.buf.length) return;
    let cap = this.buf.length;
    while (cap < this.len + extra) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.buf.subarray(0, this.len), 0);
    this.buf = next;
  }

  u8(v: number): this {
    this.ensure(1);
    this.buf[this.len++] = v & 0xff;
    return this;
  }

  bytes(b: Uint8Array): this {
    this.ensure(b.length);
    this.buf.set(b, this.len);
    this.len += b.length;
    return this;
  }

  u16(v: number): this {
    return this.u8(v >> 8).u8(v);
  }

  u32(v: number): this {
    return this.u8(v >>> 24).u8(v >>> 16).u8(v >>> 8).u8(v);
  }

  /** IEEE-754 double, big-endian. */
  f64(v: number): this {
    const tmp = new ArrayBuffer(8);
    new DataView(tmp).setFloat64(0, v, false);
    return this.bytes(new Uint8Array(tmp));
  }

  /**
   * Unsigned varint (LEB128): 7 bits per byte, MSB = continuation.
   * Values < 128 encode in 1 byte — the reason small ints are cheap.
   */
  varint(v: number): this {
    // Only safe for values up to 2^53; beyond that we lose precision.
    // Encoding loop: emit low 7 bits, shift right, continue until 0.
    let x = v;
    for (;;) {
      let b = x & 0x7f;
      x = Math.floor(x / 128);
      if (x !== 0) b |= 0x80;
      this.u8(b);
      if (x === 0) break;
    }
    return this;
  }

  /** Signed varint via zigzag: small negatives stay small (messagepack's i8 trick). */
  svarint(v: number): this {
    const zz = v >= 0 ? v * 2 : -v * 2 - 1;
    return this.varint(zz);
  }

  /** UTF-8 string with varint byte-length prefix. */
  str(s: string): this {
    const bytes = utf8Encode(s);
    this.varint(bytes.length);
    return this.bytes(bytes);
  }

  /** The written prefix as an exact-length copy. */
  finish(): Uint8Array {
    return this.buf.slice(0, this.len);
  }

  reset(): void {
    this.len = 0;
  }
}

export class ByteReader {
  private pos = 0;
  constructor(private readonly buf: Uint8Array) {}

  get remaining(): number {
    return this.buf.length - this.pos;
  }

  get offset(): number {
    return this.pos;
  }

  /** Marks a position to roll back to (streaming partial-read). */
  mark(): number {
    return this.pos;
  }

  reset(mark: number): void {
    this.pos = mark;
  }

  u8(): number {
    if (this.pos >= this.buf.length) throw new RangeError('read past end of buffer');
    return this.buf[this.pos++];
  }

  bytes(n: number): Uint8Array {
    if (this.pos + n > this.buf.length) throw new RangeError('read past end of buffer');
    const out = this.buf.slice(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  u16(): number {
    return (this.u8() << 8) | this.u8();
  }

  u32(): number {
    // >>> 0 keeps the result unsigned (CRC32 values use the high bit).
    return ((this.u8() << 24) | (this.u8() << 16) | (this.u8() << 8) | this.u8()) >>> 0;
  }

  f64(): number {
    const b = this.bytes(8);
    return new DataView(b.buffer, b.byteOffset, 8).getFloat64(0, false);
  }

  varint(): number {
    let result = 0;
    let shift = 0;
    for (;;) {
      const b = this.u8();
      result += (b & 0x7f) * Math.pow(2, shift);
      if ((b & 0x80) === 0) return result;
      shift += 7;
      if (shift > 56) throw new RangeError('varint too long');
    }
  }

  svarint(): number {
    const zz = this.varint();
    return zz % 2 === 0 ? zz / 2 : -(zz + 1) / 2;
  }

  str(): string {
    const n = this.varint();
    return utf8Decode(this.bytes(n));
  }
}

// --------------------------------------------------------------------------
// UTF-8 encode/decode without Buffer/allocUnsafe — pure TS, runs anywhere.
// --------------------------------------------------------------------------

export function utf8Encode(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let cp = s.codePointAt(i) as number;
    if (cp > 0xffff) i++;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 63),
        0x80 | ((cp >> 6) & 63),
        0x80 | (cp & 63)
      );
  }
  return new Uint8Array(out);
}

export function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i];
    if (b0 < 0x80) {
      out += String.fromCodePoint(b0);
      i += 1;
    } else if (b0 < 0xe0) {
      out += String.fromCodePoint(((b0 & 31) << 6) | (bytes[i + 1] & 63));
      i += 2;
    } else if (b0 < 0xf0) {
      out += String.fromCodePoint(
        ((b0 & 15) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63)
      );
      i += 3;
    } else {
      out += String.fromCodePoint(
        ((b0 & 7) << 18) |
          ((bytes[i + 1] & 63) << 12) |
          ((bytes[i + 2] & 63) << 6) |
          (bytes[i + 3] & 63)
      );
      i += 4;
    }
  }
  return out;
}
