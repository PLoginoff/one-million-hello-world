/**
 * Versioned payload envelope.
 *
 * Real codecs need metadata around the payload: which codec wrote it,
 * which codec version, the logical content type, and integrity. Layout:
 *
 *   magic (2B "SC") | codecVersion (u8) | contentType (varint-coded id)
 *   | flags (u8)    | payloadLen (varint) | payload | crc32 (u32)
 *
 * - `magic` rejects non-envelope bytes immediately.
 * - `codecVersion` lets readers negotiate: a v2 reader can refuse or
 *   downgrade a v1 payload explicitly instead of misinterpreting it.
 * - `contentType` is a small enum-id (not a string — envelopes are the
 *   hot path; strings go in `headers` if needed).
 * - `crc32` catches corruption in transit/at rest (IEEE polynomial,
 *   table-driven, ~1 byte per table lookup).
 *
 * @module SerializationLayer/Engine
 */

import { ByteReader, ByteWriter } from './ByteWriter';

export const ENVELOPE_MAGIC = 0x5343; // "SC"
export const ENVELOPE_VERSION = 1;

/** Content-type ids — small ints for compact wire form. */
export enum ContentTypeId {
  BINARY_CODEC = 1,
  SCHEMA_CODEC = 2,
  JSON_UTF8 = 3,
}

export interface Envelope {
  readonly codecVersion: number;
  readonly contentType: ContentTypeId;
  readonly payload: Uint8Array;
}

export class EnvelopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvelopeError';
  }
}

export class PayloadEnvelope {
  /** Wraps `payload` in a versioned envelope. */
  static wrap(contentType: ContentTypeId, payload: Uint8Array, codecVersion = ENVELOPE_VERSION): Uint8Array {
    const w = new ByteWriter(payload.length + 16);
    w.u16(ENVELOPE_MAGIC);
    w.u8(codecVersion);
    w.varint(contentType);
    w.u8(0); // flags — reserved
    w.varint(payload.length);
    w.bytes(payload);
    w.u32(crc32(payload));
    return w.finish();
  }

  /**
   * Unwraps + verifies an envelope.
   * @throws EnvelopeError on bad magic, unsupported version, length
   *         mismatch, or CRC failure.
   */
  static unwrap(buf: Uint8Array, minVersion = 1): Envelope {
    const r = new ByteReader(buf);
    const magic = r.u16();
    if (magic !== ENVELOPE_MAGIC) {
      throw new EnvelopeError(`Bad magic 0x${magic.toString(16)} — not an envelope`);
    }
    const codecVersion = r.u8();
    if (codecVersion < minVersion || codecVersion > ENVELOPE_VERSION) {
      throw new EnvelopeError(
        `Unsupported codec version ${codecVersion} (reader supports ${minVersion}-${ENVELOPE_VERSION})`
      );
    }
    const contentType = r.varint() as ContentTypeId;
    const _flags = r.u8();
    const len = r.varint();
    if (r.remaining < len + 4) {
      throw new EnvelopeError(`Truncated envelope: need ${len + 4}, have ${r.remaining}`);
    }
    const payload = r.bytes(len);
    const expectedCrc = r.u32();
    const actualCrc = crc32(payload);
    if (expectedCrc !== actualCrc) {
      throw new EnvelopeError(
        `CRC mismatch: expected 0x${expectedCrc.toString(16)}, computed 0x${actualCrc.toString(16)}`
      );
    }
    return { codecVersion, contentType, payload };
  }
}

// --------------------------------------------------------------------------
// CRC-32 (IEEE 802.3, reflected, poly 0xEDB88320) — table-driven.
// --------------------------------------------------------------------------

const CRC_TABLE = buildCrcTable();

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
}

/** CRC-32 of `bytes`. O(n), ~1 table lookup per byte. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
