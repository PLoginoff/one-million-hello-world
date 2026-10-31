/**
 * Event Security Engine — shared types.
 *
 * The event engine already provides an append-only log with upcasting and
 * projections. This module adds the production-readiness layer real event
 * stores need:
 *
 *   - Envelope encryption (AES-256-GCM, per-stream data keys) — events at
 *     rest are ciphertext; the KEK unwraps each stream's DEK on demand.
 *   - Frame delta compression — structurally similar events compress to
 *     a base event + a diff, cutting storage on repetitive payloads.
 *   - Cold-storage archival — old events move to an archive tier, fetched
 *     back on read-through miss.
 *   - Write-time schema validation — malformed events rejected at append.
 *   - Cross-bus replication — a second bus tails the log asynchronously.
 *
 * @module EventLayer/Engine/Security
 */

import type { EngineEvent, StoredEngineEvent } from '../types';

/** Ciphertext envelope produced by `StreamCipher`. */
export interface EncryptedEnvelope {
  /** AES-GCM ciphertext, base64. */
  readonly ciphertext: string;
  /** 96-bit IV, base64. Unique per encryption — GCM nonce reuse is fatal. */
  readonly iv: string;
  /** GCM auth tag, base64 (integrity: tamper → decrypt throws). */
  readonly tag: string;
  /** Which wrapped data key version encrypted this. */
  readonly keyVersion: number;
}

/** A stored event whose `data` is an `EncryptedEnvelope` instead of plaintext. */
export type StoredEncryptedEvent = Omit<StoredEngineEvent, 'data'> & {
  readonly data: EncryptedEnvelope;
};

/** Frame kind for the delta compressor's storage format. */
export type FrameKind = 'key' | 'delta';

/**
 * A compressed frame: either a full serialized event ('key') or a diff
 * against a referenced base frame ('delta'). The compressor chooses per
 * event; the codec reconstructs transparently on read.
 */
export interface EventFrame {
  readonly kind: FrameKind;
  /** For 'key' frames: the full JSON payload. */
  readonly full?: string;
  /** For 'delta' frames: the base frame id + the structural diff. */
  readonly baseId?: string;
  readonly diff?: JsonDiff;
  /** Compressed size accounting (bytes, estimated). */
  readonly sizeBytes: number;
}

/**
 * Structural JSON diff — a tree of operations applied to a base value to
 * produce the target. Keys present in `set` overwrite/add; keys in `del`
 * are removed; `nested` holds object→object recursive diffs.
 */
export interface JsonDiff {
  readonly set?: Record<string, unknown>;
  readonly del?: readonly string[];
  readonly nested?: Record<string, JsonDiff>;
  readonly value?: unknown;
}

/** Result of compressing an event against the stream's recent frames. */
export interface CompressionResult {
  readonly frame: EventFrame;
  /** Compression ratio = frameSize / uncompressedSize (<1 is a win). */
  readonly ratio: number;
  /** True when a delta frame was chosen over a full key frame. */
  readonly usedDelta: boolean;
}

/** A cold-storage record — the archive's unit of retrieval. */
export interface ArchiveRecord {
  readonly eventId: string;
  readonly streamId: string;
  readonly globalPosition: number;
  /** Serialized event payload (already-compressed frame or raw JSON). */
  readonly blob: string;
  readonly archivedAt: number;
}

/** Validation outcome for one candidate event. */
export interface SchemaValidation {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

/** A write-time schema: field types + required-ness for one event type. */
export interface EventSchema {
  readonly eventType: string;
  /** field path → expected runtime type. */
  readonly fields: Readonly<Record<string, SchemaFieldType>>;
  /** Fields that must be present. */
  readonly required?: readonly string[];
  /** Maximum schemaVersion this validator accepts. */
  readonly maxVersion?: number;
}

export type SchemaFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'date'
  | 'any';

/** Replication cursor — where a replica is caught up to. */
export interface ReplicationCursor {
  readonly source: string;
  readonly position: number;
  readonly lag: number;
}

/** Thrown when schema validation rejects an event on write. */
export class EventSchemaError extends Error {
  constructor(
    public readonly eventType: string,
    public readonly errors: readonly string[]
  ) {
    super(`Schema validation failed for "${eventType}": ${errors.join('; ')}`);
    this.name = 'EventSchemaError';
  }
}

/** Thrown when decryption fails (tampered ciphertext, wrong key). */
export class EventDecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EventDecryptionError';
  }
}

/** Thrown when a delta frame references an unknown base. */
export class FrameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FrameError';
  }
}

/** Re-exported so the facade's signature doesn't leak the engine path. */
export type { EngineEvent, StoredEngineEvent };
