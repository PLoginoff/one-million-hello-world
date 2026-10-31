/**
 * Event Security Engine — public surface.
 *
 * Production-readiness layer for the event log: AES-256-GCM envelope
 * encryption with per-stream keys, structural delta compression,
 * cold-storage archival with read-through, write-time schema validation,
 * and cross-bus replication.
 *
 * @module EventLayer/Engine/Security
 */

export { StreamCipher } from './StreamCipher';
export type { StreamCipherOptions } from './StreamCipher';
export { DeltaCompressor, jsonDiff, applyDiff } from './DeltaCompressor';
export type { DeltaCompressorOptions } from './DeltaCompressor';
export { ArchiveStore } from './ArchiveStore';
export type { ArchiveStoreOptions } from './ArchiveStore';
export { WriteSchemaValidator } from './WriteSchemaValidator';
export { BusReplicator } from './BusReplicator';
export type { BusReplicatorOptions } from './BusReplicator';
export { EventThrottler } from './EventThrottler';
export type { ThrottleOptions, ThrottleDecision } from './EventThrottler';
export { EventRetention } from './EventRetention';
export type { RetentionPolicy, RetentionEvaluation } from './EventRetention';
export { SecureEventEngine } from './SecureEventEngine';
export type { SecureEventEngineOptions } from './SecureEventEngine';
export {
  EventSchemaError,
  EventDecryptionError,
  FrameError,
} from './types';
export type {
  EncryptedEnvelope,
  StoredEncryptedEvent,
  FrameKind,
  EventFrame,
  JsonDiff,
  CompressionResult,
  ArchiveRecord,
  SchemaValidation,
  EventSchema,
  SchemaFieldType,
  ReplicationCursor,
} from './types';
