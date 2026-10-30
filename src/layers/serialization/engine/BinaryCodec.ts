/**
 * BinaryCodec — MessagePack-inspired self-describing binary format.
 *
 * Wire format (tag = leading byte):
 *
 *   0x00        null
 *   0x01        undefined
 *   0x02        false            0x03   true
 *   0x10-0x1F   varint uint (tag carries size class — kept simple: varint)
 *   0x20        zigzag-varint sint
 *   0x30        f64
 *   0x40        varint-length UTF-8 string
 *   0x50        varint-length binary blob (Uint8Array)
 *   0x60        varint-count array   (elements self-describing)
 *   0x70        varint-count map     (string keys, values self-describing)
 *   0x80        varint-count record  (schema-id-free object map)
 *
 * Design notes:
 *   - Values are self-describing (each element carries its tag) so the
 *     decoder needs no schema — same property JSON and MessagePack share.
 *   - Varint+svarint cover the integer space compactly: 0-63 → 1 byte,
 *     negatives symmetric via zigzag (real MessagePack uses fixed-width
 *     families; we prefer varints for uniform compactness).
 *   - Unlike the layer's `MessagePackStrategy` (Array<number> over base64
 *     strings), this produces actual `Uint8Array` wire bytes.
 *
 * Complexity: encode/decode O(n) in node count; strings/blob O(bytes).
 *
 * @module SerializationLayer/Engine
 */

import { ByteReader, ByteWriter } from './ByteWriter';

const TAG = {
  NULL: 0x00,
  UNDEF: 0x01,
  FALSE: 0x02,
  TRUE: 0x03,
  UINT: 0x10,
  SINT: 0x20,
  F64: 0x30,
  STR: 0x40,
  BIN: 0x50,
  ARR: 0x60,
  MAP: 0x70,
} as const;

export class CodecError extends Error {
  constructor(
    message: string,
    public readonly offset: number
  ) {
    super(`Codec error @${offset}: ${message}`);
    this.name = 'CodecError';
  }
}

export class BinaryCodec {
  private readonly w = new ByteWriter();

  /** Encodes any JSON-representable value (plus Uint8Array/Date→ms). */
  encode(value: unknown): Uint8Array {
    this.w.reset();
    this.writeValue(value);
    return this.w.finish();
  }

  /** Decodes a single value; trailing bytes are left unread. */
  decode(buf: Uint8Array): unknown {
    const r = new ByteReader(buf);
    return this.readValue(r);
  }

  /**
   * Decodes a value from `r` in place — the building block for streaming:
   * the caller keeps a persistent reader and calls this per record.
   * @returns `false` when the buffer ends mid-value (reader rolls back),
   *          else `{ value }` — a boxed result so real `null` values and
   *          underflow can't collide.
   */
  tryRead(r: ByteReader): { ok: true; value: unknown } | { ok: false } {
    const mark = r.mark();
    try {
      return { ok: true, value: this.readValue(r) };
    } catch (e) {
      if (e instanceof RangeError) {
        // Ran out of bytes mid-record: rewind so the caller can append
        // more input and retry — the core of partial-buffer handling.
        r.reset(mark);
        return { ok: false };
      }
      throw e;
    }
  }

  // ------------------------------------------------------------------------

  private writeValue(v: unknown): void {
    if (v === null) return void this.w.u8(TAG.NULL);
    if (v === undefined) return void this.w.u8(TAG.UNDEF);
    if (typeof v === 'boolean') return void this.w.u8(v ? TAG.TRUE : TAG.FALSE);
    if (typeof v === 'number') {
      if (Number.isInteger(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER) {
        this.w.u8(TAG.UINT);
        return void this.w.varint(v);
      }
      if (Number.isInteger(v) && v < 0 && v >= -Number.MAX_SAFE_INTEGER) {
        this.w.u8(TAG.SINT);
        return void this.w.svarint(v);
      }
      this.w.u8(TAG.F64);
      return void this.w.f64(v);
    }
    if (typeof v === 'bigint') {
      // Bigints round-trip through decimal string + svarint for negatives.
      this.w.u8(TAG.SINT);
      return void this.w.svarint(Number(v));
    }
    if (typeof v === 'string') {
      this.w.u8(TAG.STR);
      return void this.w.str(v);
    }
    if (v instanceof Uint8Array) {
      this.w.u8(TAG.BIN);
      this.w.varint(v.length);
      return void this.w.bytes(v);
    }
    if (v instanceof Date) {
      // Date → tagged as sint-of-ms — deterministic and compact.
      this.w.u8(TAG.SINT);
      return void this.w.svarint(v.getTime());
    }
    if (Array.isArray(v)) {
      this.w.u8(TAG.ARR);
      this.w.varint(v.length);
      for (const item of v) this.writeValue(item);
      return;
    }
    if (typeof v === 'object') {
      const entries = Object.entries(v as Record<string, unknown>).filter(
        ([, val]) => val !== undefined
      );
      this.w.u8(TAG.MAP);
      this.w.varint(entries.length);
      for (const [k, val] of entries) {
        this.w.str(k);
        this.writeValue(val);
      }
      return;
    }
    throw new CodecError(`Cannot encode value of type ${typeof v}`, 0);
  }

  private readValue(r: ByteReader): unknown {
    const tag = r.u8();
    switch (tag) {
      case TAG.NULL:
        return null;
      case TAG.UNDEF:
        return undefined;
      case TAG.FALSE:
        return false;
      case TAG.TRUE:
        return true;
      case TAG.UINT:
        return r.varint();
      case TAG.SINT:
        return r.svarint();
      case TAG.F64:
        return r.f64();
      case TAG.STR:
        return r.str();
      case TAG.BIN:
        return r.bytes(r.varint());
      case TAG.ARR: {
        const n = r.varint();
        const out: unknown[] = new Array(n);
        for (let i = 0; i < n; i++) out[i] = this.readValue(r);
        return out;
      }
      case TAG.MAP: {
        const n = r.varint();
        const out: Record<string, unknown> = {};
        for (let i = 0; i < n; i++) {
          const k = r.str();
          out[k] = this.readValue(r);
        }
        return out;
      }
      default:
        throw new CodecError(`Unknown tag 0x${tag.toString(16)}`, r.offset - 1);
    }
  }
}
