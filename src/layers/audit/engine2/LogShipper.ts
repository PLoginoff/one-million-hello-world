/**
 * Audit Log Shipper
 *
 * Batches audit records for delivery to an external sink (SIEM, object
 * storage) with dual flush triggers:
 *
 *   1. Size  — flush when buffered bytes reach `maxBatchBytes`
 *   2. Time  — flush when the oldest buffered record ages past `maxDelayMs`
 *
 * Backpressure: when the sink rejects (or is slow), the shipper applies
 * exponential backoff and caps the in-memory buffer at
 * `maxBufferedBytes`; `enqueue` then returns `false` so callers can
 * shed load or park in a spill file rather than OOM.
 *
 * The clock is injectable — `tick()` drives the time-based flush,
 * letting tests run without timers.
 *
 * @module AuditLayer/Engine2
 */

import type { AuditRecord } from '../engine/types';

/** Destination for shipped batches; `ship` may throw/reject to fail. */
export interface LogSink2 {
  ship(batch: readonly AuditRecord[], bytes: number): Promise<void> | void;
}

export interface ShipperConfig {
  /** Flush threshold in serialized bytes. */
  readonly maxBatchBytes: number;
  /** Flush interval — ms a record may sit buffered. */
  readonly maxDelayMs: number;
  /** Hard buffer cap (bytes) before enqueue starts refusing. */
  readonly maxBufferedBytes: number;
  /** Initial backoff after a failed ship (ms). */
  readonly retryBaseMs?: number;
  /** Backoff cap (ms). */
  readonly retryMaxMs?: number;
  /** Max retries per batch before it is dropped (default unlimited). */
  readonly maxRetries?: number;
  readonly clock?: { now(): number };
}

export interface ShipperStats {
  readonly bufferedRecords: number;
  readonly bufferedBytes: number;
  readonly shippedBatches: number;
  readonly shippedRecords: number;
  readonly droppedRecords: number;
  readonly refusedEnqueues: number;
  readonly retries: number;
  readonly flushPending: boolean;
}

const DEFAULTS = {
  retryBaseMs: 500,
  retryMaxMs: 30_000,
} as const;

/** In-memory sink that records every ship call — test/build-block. */
export class InMemoryLogSink2 implements LogSink2 {
  readonly batches: Array<{ records: readonly AuditRecord[]; bytes: number }> = [];
  /** When set, ship() rejects this many times before succeeding. */
  failNextTimes = 0;

  ship(batch: readonly AuditRecord[], bytes: number): void {
    if (this.failNextTimes > 0) {
      this.failNextTimes--;
      throw new Error('sink unavailable');
    }
    this.batches.push({ records: batch.slice(), bytes });
  }
}

export class LogShipper {
  private readonly _cfg: Required<Omit<ShipperConfig, 'maxRetries' | 'clock'>> & {
    maxRetries?: number;
  };
  private readonly _sink: LogSink2;
  private readonly _clock: { now(): number };

  private _buffer: AuditRecord[] = [];
  private _bufferBytes = 0;
  private _oldestAt = 0;
  private _backoffUntil = 0;
  private _backoffMs: number;
  private _inflight: Promise<void> | null = null;
  private _inflightRetries = 0;
  private _inflightBatch: AuditRecord[] = [];
  private _inflightBytes = 0;

  private _stats = {
    shippedBatches: 0,
    shippedRecords: 0,
    droppedRecords: 0,
    refusedEnqueues: 0,
    retries: 0,
  };

  constructor(sink: LogSink2, config: ShipperConfig) {
    this._sink = sink;
    this._cfg = {
      maxBatchBytes: config.maxBatchBytes,
      maxDelayMs: config.maxDelayMs,
      maxBufferedBytes: config.maxBufferedBytes,
      retryBaseMs: config.retryBaseMs ?? DEFAULTS.retryBaseMs,
      retryMaxMs: config.retryMaxMs ?? DEFAULTS.retryMaxMs,
      maxRetries: config.maxRetries,
    };
    this._clock = config.clock ?? { now: () => Date.now() };
    this._backoffMs = this._cfg.retryBaseMs;
  }

  /** Rough serialized size — matches `toJsonLine` plus newline. */
  private recordBytes(r: AuditRecord): number {
    return JSON.stringify(r).length + 1;
  }

  /**
   * Buffer a record. Returns false when the hard buffer cap is reached
   * (backpressure signal — caller must decide: drop, spill, or block).
   */
  enqueue(record: AuditRecord): boolean {
    const bytes = this.recordBytes(record);
    if (this._bufferBytes + bytes > this._cfg.maxBufferedBytes) {
      this._stats.refusedEnqueues++;
      return false;
    }
    if (this._buffer.length === 0) this._oldestAt = this._clock.now();
    this._buffer.push(record);
    this._bufferBytes += bytes;
    if (this._bufferBytes >= this._cfg.maxBatchBytes) {
      void this.flush();
    }
    return true;
  }

  /** Drive the time-based flush — call periodically (or per tick in tests). */
  tick(): void {
    if (this._buffer.length === 0) return;
    if (this._clock.now() - this._oldestAt >= this._cfg.maxDelayMs) {
      void this.flush();
    }
  }

  /**
   * Attempt to ship the buffered batch. One attempt per call while a
   * failure cooldown is active — callers drive retries by invoking
   * `flush` again (e.g. from a periodic scheduler or `tick`).
   * Serialized through `_inflight` so a slow sink never sees
   * concurrent batches from us.
   */
  async flush(): Promise<void> {
    if (this._inflight !== null) {
      // A retry is already in flight — finish that first.
      return this._inflight;
    }
    if (this._buffer.length === 0) return;
    if (this._clock.now() < this._backoffUntil) return; // cooling down

    this._inflightBatch = this._buffer;
    this._inflightBytes = this._bufferBytes;
    this._buffer = [];
    this._bufferBytes = 0;
    // `_inflightRetries` persists across flush calls for the same batch
    // and is reset by shipWithRetry on success/drop.

    this._inflight = this.shipWithRetry();
    try {
      await this._inflight;
    } finally {
      this._inflight = null;
    }
  }

  private async shipWithRetry(): Promise<void> {
    const batch = this._inflightBatch;
    const bytes = this._inflightBytes;
    for (;;) {
      try {
        await this._sink.ship(batch, bytes);
        this._stats.shippedBatches++;
        this._stats.shippedRecords += batch.length;
        this._backoffMs = this._cfg.retryBaseMs;
        this._inflightRetries = 0;
        return;
      } catch {
        this._stats.retries++;
        this._inflightRetries++;
        if (
          this._cfg.maxRetries !== undefined &&
          this._inflightRetries > this._cfg.maxRetries
        ) {
          this._stats.droppedRecords += batch.length;
          this._inflightRetries = 0;
          this._inflightBatch = [];
          this._inflightBytes = 0;
          this._backoffMs = this._cfg.retryBaseMs;
          return;
        }
        // Exponential backoff — yield to the caller's loop between tries.
        this._backoffUntil = this._clock.now() + this._backoffMs;
        this._backoffMs = Math.min(this._backoffMs * 2, this._cfg.retryMaxMs);
        return this.requeueForRetry();
      }
    }
  }

  /**
   * Put a failed batch back at the front of the buffer so ordering is
   * preserved; refuse-and-drop if it would exceed the hard cap.
   */
  private requeueForRetry(): void {
    const batch = this._inflightBatch;
    const bytes = this._inflightBytes;
    if (this._bufferBytes + bytes <= this._cfg.maxBufferedBytes) {
      this._buffer = [...batch, ...this._buffer];
      this._bufferBytes += bytes;
      if (this._buffer.length > 0) {
        this._oldestAt = Math.min(this._oldestAt, this._clock.now());
      }
    } else {
      // Cannot even re-buffer — records are dropped rather than OOM.
      this._stats.droppedRecords += batch.length;
    }
    this._inflightBatch = [];
    this._inflightBytes = 0;
  }

  get stats(): ShipperStats {
    return {
      bufferedRecords: this._buffer.length,
      bufferedBytes: this._bufferBytes,
      shippedBatches: this._stats.shippedBatches,
      shippedRecords: this._stats.shippedRecords,
      droppedRecords: this._stats.droppedRecords,
      refusedEnqueues: this._stats.refusedEnqueues,
      retries: this._stats.retries,
      flushPending: this._inflight !== null || this._clock.now() < this._backoffUntil,
    };
  }
}
