/**
 * Serialization Engine — public surface.
 *
 * Real binary codec machinery: byte-level MessagePack-style encoding,
 * schema-compiled positional records, incremental stream decoding with
 * partial-buffer handling, and CRC-protected versioned envelopes.
 *
 * @module SerializationLayer/Engine
 */

export { ByteWriter, ByteReader, utf8Encode, utf8Decode } from './ByteWriter';
export { BinaryCodec, CodecError } from './BinaryCodec';
export { SchemaCodec } from './SchemaCodec';
export type { SchemaDef, FieldSpec, FieldKind } from './SchemaCodec';
export { StreamDecoder, encodeFrame } from './StreamDecoder';
export type { StreamMode, StreamDecoderOptions } from './StreamDecoder';
export { PayloadEnvelope, crc32, ContentTypeId, EnvelopeError, ENVELOPE_VERSION } from './Envelope';
export type { Envelope } from './Envelope';
