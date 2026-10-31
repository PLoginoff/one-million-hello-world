/**
 * SecureEventEngine — facade composing the security/storage engines.
 *
 * Wraps `EventEngine` with the production-readiness layer:
 *   append → schema-validate → encrypt payload → compress → log
 *   read   → log/archive → decompress → decrypt → upcast → return
 *
 * The facade owns the pipeline ordering so a caller can't accidentally
 * compress ciphertext (diffs on ciphertext are meaningless — encrypt AFTER
 * delta-compressing, or compress the plaintext and encrypt the frame;
 * here we compress the plaintext data and encrypt the serialized frame).
 *
 * @module EventLayer/Engine/Security
 */

import { EventLog, EventLogOptions } from '../EventLog';
import { EngineEvent, StoredEngineEvent } from '../types';
import { UpcasterRegistry } from '../Upcasting';
import { ArchiveStore } from './ArchiveStore';
import { BusReplicator } from './BusReplicator';
import { DeltaCompressor } from './DeltaCompressor';
import { StreamCipher } from './StreamCipher';
import { WriteSchemaValidator } from './WriteSchemaValidator';
import { EncryptedEnvelope, EventFrame } from './types';

export interface SecureEventEngineOptions extends EventLogOptions {
  readonly encryption?: boolean;
  readonly compression?: boolean;
  readonly keyEvery?: number;
}

/**
 * Stored form when encryption/compression are on: the event's `data` slot
 * holds an `EncryptedEnvelope` around a JSON string of the `EventFrame`.
 * Decoding is the exact reverse.
 */
export class SecureEventEngine {
  readonly log: EventLog;
  readonly cipher: StreamCipher;
  readonly compressor: DeltaCompressor;
  readonly archive: ArchiveStore;
  readonly schemas: WriteSchemaValidator;
  readonly upcasters = new UpcasterRegistry();
  private readonly encrypt: boolean;
  private readonly compress: boolean;

  constructor(options: SecureEventEngineOptions = {}) {
    this.log = new EventLog(options);
    this.cipher = new StreamCipher();
    this.compressor = new DeltaCompressor({ keyEvery: options.keyEvery });
    this.archive = new ArchiveStore({ clock: options.clock });
    this.schemas = new WriteSchemaValidator();
    this.encrypt = options.encryption ?? true;
    this.compress = options.compression ?? true;
  }

  /**
   * Validated append: schema check → optional compress+encrypt → commit.
   * `expectedStreamPosition` carries through to the log's optimistic
   * concurrency.
   */
  emit(
    streamId: string,
    events: readonly EngineEvent[],
    expectedStreamPosition?: number
  ): StoredEngineEvent[] {
    for (const e of events) this.schemas.assertValid(e);
    const prepared = events.map((e) => this.prepare(streamId, e));
    return this.log.append(streamId, prepared, expectedStreamPosition);
  }

  /** Reads a stream, decoding encryption/compression transparently. */
  readStream(streamId: string, from?: number, to?: number): StoredEngineEvent[] {
    return this.log
      .readStream(streamId, from, to)
      .map((e) => this.restore(e));
  }

  /** Reads the global log with decoding (replay/catch-up path). */
  readAll(from = 0, limit?: number): StoredEngineEvent[] {
    return this.log.readFrom(from, limit).map((e) => this.restore(e));
  }

  /**
   * Read-through archive resolution: position absent from the hot log is
   * fetched from cold storage (the event still decodes — archive stores
   * the plaintext-stored form so retrieve→restore is consistent).
   */
  resolve(globalPosition: number): StoredEngineEvent | null {
    const ev = this.archive.resolve(this.log, globalPosition);
    return ev ? this.restore(ev) : null;
  }

  /** Archives events older than `retentionMs` into cold storage. */
  archiveOlderThan(retentionMs: number): number[] {
    return this.archive.archiveEligible(this.log, retentionMs);
  }

  /** Attaches a replicator tailing this engine's log into `target`. */
  replicateTo(target: EventLog | SecureEventEngine): BusReplicator {
    const t = target instanceof SecureEventEngine ? target.log : target;
    return new BusReplicator(this.log, t);
  }

  // ------------------------------------------------------------------------

  private prepare(streamId: string, e: EngineEvent): EngineEvent {
    let data: unknown = e.data;
    if (this.compress) {
      // Store the FRAME (compressed or key) as the payload; decode reverses.
      const frame = this.compressor.encode(streamId, data).frame;
      data = { __frame: frame } satisfies { __frame: EventFrame };
    }
    if (this.encrypt) {
      const envelope = this.cipher.encrypt(streamId, data);
      data = { __enc: envelope } satisfies { __enc: EncryptedEnvelope };
    }
    return { ...e, data };
  }

  private restore(e: StoredEngineEvent): StoredEngineEvent {
    let data: unknown = e.data;
    if (this.encrypt && isEncrypted(data)) {
      data = this.cipher.decrypt(e.streamId, data.__enc);
    }
    if (this.compress && isFramed(data)) {
      data = this.compressor.decode(e.streamId, data.__frame);
    }
    return { ...e, data };
  }
}

function isEncrypted(v: unknown): v is { __enc: EncryptedEnvelope } {
  return typeof v === 'object' && v !== null && '__enc' in v;
}
function isFramed(v: unknown): v is { __frame: EventFrame } {
  return typeof v === 'object' && v !== null && '__frame' in v;
}
