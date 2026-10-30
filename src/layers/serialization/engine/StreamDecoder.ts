/**
 * StreamDecoder — incremental decoding over partial buffers.
 *
 * Network/file input arrives in arbitrary chunks that do NOT align to
 * record boundaries. This class owns the reassembly:
 *
 *   feed(bytes) ──► append to pending buffer ──► tryRead until
 *                                                  ├─ record → emit
 *                                                  └─ underflow → keep
 *                                                     remainder, wait
 *
 * Two framing modes:
 *   - `raw`   — values are self-describing; a complete value ends when its
 *               tag structure is fully buffered. Underflow → keep bytes.
 *   - `frame` — varint length-prefixed records; frame boundaries are
 *               explicit so `tryRead` never has to guess where a record ends.
 *
 * The pending buffer is compacted when the consumed prefix passes 64 KiB —
 * sliding-window memory bound so a long-lived stream doesn't grow forever.
 *
 * @module SerializationLayer/Engine
 */

import { BinaryCodec } from './BinaryCodec';
import { ByteReader } from './ByteWriter';

export type StreamMode = 'raw' | 'frame';

export interface StreamDecoderOptions {
  readonly mode?: StreamMode;
  /** Compaction threshold (bytes consumed before reallocation). */
  readonly compactThreshold?: number;
  /** Max buffered bytes before feed throws (defends against unbounded input). */
  readonly maxBuffer?: number;
}

export class StreamDecoder {
  private readonly codec = new BinaryCodec();
  private pending: Uint8Array = new Uint8Array(0);
  private readonly mode: StreamMode;
  private readonly compactThreshold: number;
  private readonly maxBuffer: number;

  constructor(options: StreamDecoderOptions = {}) {
    this.mode = options.mode ?? 'frame';
    this.compactThreshold = options.compactThreshold ?? 65_536;
    this.maxBuffer = options.maxBuffer ?? 4 * 1024 * 1024;
  }

  /** Bytes currently buffered awaiting the rest of a record. */
  get bufferedBytes(): number {
    return this.pending.length;
  }

  /**
   * Feeds a chunk and returns every record completed by it.
   * Throws when the buffer would exceed `maxBuffer`.
   */
  feed(chunk: Uint8Array): unknown[] {
    if (this.pending.length + chunk.length > this.maxBuffer) {
      throw new Error(`Stream buffer overflow: >${this.maxBuffer} bytes`);
    }
    const merged = new Uint8Array(this.pending.length + chunk.length);
    merged.set(this.pending, 0);
    merged.set(chunk, this.pending.length);
    this.pending = merged;

    const out: unknown[] = [];
    const reader = new ByteReader(this.pending);
    for (;;) {
      const mark = reader.mark();
      const record = this.mode === 'frame' ? this.readFrame(reader) : this.tryReadRaw(reader);
      if (record === INCOMPLETE) {
        reader.reset(mark);
        break;
      }
      out.push(record);
    }
    // Retain only the unconsumed suffix.
    this.pending = this.pending.slice(reader.offset);
    return out;
  }

  /**
   * Flushes at end-of-stream. Returns remaining complete records;
   * throws if the buffer ends mid-record (truncated input).
   */
  finish(): unknown[] {
    const out = this.feed(new Uint8Array(0));
    if (this.pending.length > 0) {
      throw new Error(`Stream truncated: ${this.pending.length} undelivered bytes`);
    }
    return out;
  }

  // ------------------------------------------------------------------------

  /** Raw mode: boxed tryRead keeps real `null` distinct from underflow. */
  private tryReadRaw(reader: ByteReader): unknown {
    const res = this.codec.tryRead(reader);
    return res.ok ? res.value : INCOMPLETE;
  }

  /** Reads one length-prefixed frame; INCOMPLETE on underflow. */
  private readFrame(reader: ByteReader): unknown {
    const mark = reader.mark();
    try {
      const len = reader.varint();
      if (reader.remaining < len) {
        reader.reset(mark);
        return INCOMPLETE;
      }
      const body = reader.bytes(len);
      // A complete frame's body decodes to a value that may itself be null —
      // that's a real value, not underflow.
      return this.codec.decode(body);
    } catch (e) {
      if (e instanceof RangeError) {
        reader.reset(mark);
        return INCOMPLETE;
      }
      throw e;
    }
  }
}

/** Sentinel distinguishing "record decoded to null" from "need more bytes". */
const INCOMPLETE: unique symbol = Symbol('stream.incomplete');

/** Encodes one value as a length-prefixed frame (feed-side counterpart). */
export function encodeFrame(value: unknown): Uint8Array {
  const codec = new BinaryCodec();
  const body = codec.encode(value);
  const head = new ByteWriterLite();
  head.varint(body.length);
  const headBytes = head.finish();
  const out = new Uint8Array(headBytes.length + body.length);
  out.set(headBytes, 0);
  out.set(body, headBytes.length);
  return out;
}

/** Minimal varint-only writer for frame heads (avoids importing ByteWriter's full API). */
class ByteWriterLite {
  private bytes: number[] = [];
  varint(v: number): this {
    let x = v;
    for (;;) {
      let b = x & 0x7f;
      x = Math.floor(x / 128);
      if (x !== 0) b |= 0x80;
      this.bytes.push(b);
      if (x === 0) break;
    }
    return this;
  }
  finish(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}
