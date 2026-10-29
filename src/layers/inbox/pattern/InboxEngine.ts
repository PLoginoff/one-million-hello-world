/**
 * InboxEngine — idempotent consumer (inbox pattern).
 *
 * Storage:
 *  - `_records`:   Map<recordId, InboxRecord>
 *  - `_byKey`:     Map<consumer|messageId, recordId> — dedup index;
 *                  receiving a known messageId returns the original
 *                  record (idempotent redelivery) instead of a second copy
 *  - `_byConsumer`: Map<consumer, Set<recordId>> — per-consumer work set
 *  - `_nextSeq`:   Map<consumer, next expected sequence> — ordered mode
 *
 * Processing flow (`processNext`):
 *   1. Reap expired leases (crashed consumer) back to RECEIVED.
 *   2. Pick the oldest actionable record: RECEIVED (or FAILED whose
 *      backoff has elapsed).
 *   3. Ordered mode: if the record's sequence isn't the expected next,
 *      mark it DEFERRED and pick the next candidate; a DEFERRED record
 *      is promoted once its predecessor is PROCESSED.
 *   4. acquire() -> PROCESSING (lease starts), invoke the handler.
 *      Success -> PROCESSED + promote deferred successors.
 *      Failure -> FAILED with backoff, or PARKED past maxAttempts.
 *
 * Concurrency: `processAll` runs handlers serially within a consumer —
 * matching a single-threaded consumer; the in-flight lease prevents a
 * second poller (even in-process) from double-processing.
 *
 * @module Inbox/Pattern
 */

import { randomBytes } from 'crypto';
import {
  InboxRecord,
  InboxState,
  ReceiveResult,
  ProcessOutcome,
  MessageHandler,
  InboxEngineConfig,
  DEFAULT_INBOX_CONFIG,
  ConsumerStats,
  InboxPatternError,
  InboxPatternErrorCode,
} from './types';
import { InboxStateMachine } from './InboxStateMachine';
import { BackoffStrategy } from './BackoffStrategy';

export class InboxEngine {
  private readonly _records: Map<string, InboxRecord> = new Map();
  private readonly _byKey: Map<string, string> = new Map();
  private readonly _byConsumer: Map<string, Set<string>> = new Map();
  private readonly _nextSeq: Map<string, number> = new Map();
  private readonly _backoff: BackoffStrategy;
  private readonly _config: InboxEngineConfig;
  private readonly _now: () => number;
  private readonly _stats: Map<string, ConsumerStats> = new Map();

  constructor(config?: Partial<InboxEngineConfig>, now: () => number = Date.now, rng: () => number = Math.random) {
    this._config = {
      ...DEFAULT_INBOX_CONFIG,
      ...config,
      retry: { ...DEFAULT_INBOX_CONFIG.retry, ...config?.retry },
    };
    this._backoff = new BackoffStrategy(this._config.retry, rng);
    this._now = now;
  }

  private _statsFor(consumer: string): ConsumerStats {
    let s = this._stats.get(consumer);
    if (!s) {
      s = { received: 0, processed: 0, failedAttempts: 0, duplicates: 0, parked: 0, deferred: 0, inFlight: 0, pending: 0 };
      this._stats.set(consumer, s);
    }
    return s;
  }

  private _key(consumer: string, messageId: string): string {
    return `${consumer}|${messageId}`;
  }

  // ------------------------------------------------------------------
  // Receive / dedup
  // ------------------------------------------------------------------

  /**
   * Record an incoming message. Idempotent: a redelivery of a known
   * messageId returns the original record with `duplicate: true` —
   * the producer's retry is safe by construction.
   */
  receive(consumer: string, messageId: string, payload: unknown, sequence?: number): ReceiveResult {
    const key = this._key(consumer, messageId);
    const existingId = this._byKey.get(key);
    if (existingId !== undefined) {
      const existing = this._records.get(existingId);
      if (existing) {
        this._statsFor(consumer).duplicates++;
        return { record: existing, duplicate: true };
      }
    }
    const now = this._now();
    const record: InboxRecord = {
      id: `inb_${randomBytes(10).toString('base64url')}`,
      consumer,
      messageId,
      payload,
      sequence,
      state: InboxState.RECEIVED,
      attempts: 0,
      receivedAt: now,
    };
    this._records.set(record.id, record);
    this._byKey.set(key, record.id);
    let set = this._byConsumer.get(consumer);
    if (!set) {
      set = new Set();
      this._byConsumer.set(consumer, set);
    }
    set.add(record.id);
    const s = this._statsFor(consumer);
    s.received++;
    s.pending++;
    // Sequence bootstrap: first sequenced record for a consumer whose
    // sequence is higher than expected — defer rather than assume 1.
    if (this._config.ordered && sequence !== undefined && !this._nextSeq.has(consumer)) {
      this._nextSeq.set(consumer, 1);
    }
    return { record, duplicate: false };
  }

  // ------------------------------------------------------------------
  // Processing
  // ------------------------------------------------------------------

  /**
   * Process the next actionable record for a consumer.
   * Returns the outcome so pollers can decide whether to keep draining.
   */
  async processNext(consumer: string, handler: MessageHandler): Promise<ProcessOutcome> {
    const now = this._now();
    this._reapExpiredLeases(consumer, now);
    const record = this._nextActionable(consumer, now);
    if (!record) return ProcessOutcome.NOTHING_PENDING;

    if (this._config.ordered && record.sequence !== undefined) {
      const expected = this._nextSeq.get(consumer) ?? 1;
      if (record.sequence > expected) {
        if (record.state === InboxState.RECEIVED) {
          InboxStateMachine.defer(record);
          this._statsFor(consumer).deferred++;
        }
        return ProcessOutcome.DEFERRED_ORDERING;
      }
      // record.sequence < expected shouldn't happen (dedup by seq not key),
      // but tolerate: process it anyway.
    }

    const stats = this._statsFor(consumer);
    try {
      InboxStateMachine.acquire(record, now, this._config.leaseMs);
    } catch {
      return ProcessOutcome.LOCK_BUSY;
    }
    stats.inFlight++;
    stats.pending--;

    try {
      await handler(record.payload, record);
      InboxStateMachine.complete(record, this._now());
      stats.inFlight--;
      stats.processed++;
      this._advanceSequence(consumer, record);
      this._promoteDeferred(consumer);
      return ProcessOutcome.PROCESSED;
    } catch (e) {
      stats.inFlight--;
      stats.failedAttempts++;
      const msg = e instanceof Error ? e.message : String(e);
      if (this._backoff.shouldPark(record.attempts)) {
        InboxStateMachine.park(record, msg, this._now());
        stats.parked++;
        return ProcessOutcome.PARKED;
      }
      InboxStateMachine.fail(record, msg, this._now() + this._backoff.delay(record.attempts));
      stats.pending++;
      return ProcessOutcome.RETRY_SCHEDULED;
    }
  }

  /** Drain until nothing is actionable (bounded by `limit` iterations). */
  async processAll(consumer: string, handler: MessageHandler, limit = 10_000): Promise<{ processed: number; parked: number; deferred: number }> {
    let processed = 0, parked = 0, deferred = 0;
    for (let i = 0; i < limit; i++) {
      const outcome = await this.processNext(consumer, handler);
      if (outcome === ProcessOutcome.PROCESSED) { processed++; continue; }
      if (outcome === ProcessOutcome.PARKED) { parked++; continue; }
      if (outcome === ProcessOutcome.RETRY_SCHEDULED) break; // backoff — nothing else due now? try next record
      if (outcome === ProcessOutcome.DEFERRED_ORDERING) {
        deferred++;
        continue;
      }
      break; // NOTHING_PENDING / LOCK_BUSY
    }
    return { processed, parked, deferred };
  }

  /** Force-process a specific record regardless of ordering (admin). */
  async processRecord(recordId: string, handler: MessageHandler): Promise<ProcessOutcome> {
    const record = this._records.get(recordId);
    if (!record) {
      throw new InboxPatternError(InboxPatternErrorCode.RECORD_NOT_FOUND, `record not found: ${recordId}`);
    }
    const stats = this._statsFor(record.consumer);
    InboxStateMachine.acquire(record, this._now(), this._config.leaseMs);
    stats.inFlight++;
    stats.pending--;
    try {
      await handler(record.payload, record);
      InboxStateMachine.complete(record, this._now());
      stats.inFlight--;
      stats.processed++;
      this._advanceSequence(record.consumer, record);
      this._promoteDeferred(record.consumer);
      return ProcessOutcome.PROCESSED;
    } catch (e) {
      stats.inFlight--;
      stats.failedAttempts++;
      const msg = e instanceof Error ? e.message : String(e);
      if (this._backoff.shouldPark(record.attempts)) {
        InboxStateMachine.park(record, msg, this._now());
        stats.parked++;
        return ProcessOutcome.PARKED;
      }
      InboxStateMachine.fail(record, msg, this._now() + this._backoff.delay(record.attempts));
      stats.pending++;
      return ProcessOutcome.RETRY_SCHEDULED;
    }
  }

  // ------------------------------------------------------------------
  // Ordered delivery
  // ------------------------------------------------------------------

  /** After a record completes, bump the expected sequence. */
  private _advanceSequence(consumer: string, record: InboxRecord): void {
    if (record.sequence === undefined) return;
    const expected = this._nextSeq.get(consumer) ?? 1;
    if (record.sequence === expected) {
      this._nextSeq.set(consumer, expected + 1);
    }
  }

  /** Promote DEFERRED records whose sequence is now due. */
  private _promoteDeferred(consumer: string): void {
    const set = this._byConsumer.get(consumer);
    if (!set) return;
    const expected = this._nextSeq.get(consumer) ?? 1;
    let promoted = true;
    let next = expected;
    while (promoted) {
      promoted = false;
      for (const id of set) {
        const r = this._records.get(id);
        if (r && r.state === InboxState.DEFERRED && r.sequence === next) {
          InboxStateMachine.undefer(r);
          next = r.sequence; // becomes due; after processing expected advances
          promoted = true;
        }
      }
    }
    // Gap tolerance: if too many deferred pile up, jump expected past gap
    const gap = this._config.maxSequenceGapWait;
    if (gap > 0) {
      const deferredSeqs = [...set]
        .map((id) => this._records.get(id))
        .filter((r): r is InboxRecord => r !== undefined && r.state === InboxState.DEFERRED)
        .map((r) => r.sequence!)
        .sort((a, b) => a - b);
      if (deferredSeqs.length >= gap) {
        this._nextSeq.set(consumer, deferredSeqs[0]);
        for (const id of set) {
          const r = this._records.get(id);
          if (r && r.state === InboxState.DEFERRED && r.sequence === deferredSeqs[0]) {
            InboxStateMachine.undefer(r);
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // Recovery / maintenance
  // ------------------------------------------------------------------

  /** Requeue PROCESSING records whose lease expired (crash recovery). */
  private _reapExpiredLeases(consumer: string, now: number): number {
    const set = this._byConsumer.get(consumer);
    if (!set) return 0;
    let reaped = 0;
    for (const id of set) {
      const r = this._records.get(id);
      if (r && InboxStateMachine.leaseExpired(r, now)) {
        InboxStateMachine.release(r);
        this._statsFor(consumer).inFlight--;
        reaped++;
      }
    }
    return reaped;
  }

  /** Oldest actionable record: RECEIVED, or FAILED with due retry. */
  private _nextActionable(consumer: string, now: number): InboxRecord | undefined {
    const set = this._byConsumer.get(consumer);
    if (!set) return undefined;
    let best: InboxRecord | undefined;
    for (const id of set) {
      const r = this._records.get(id);
      if (!r) continue;
      const actionable =
        r.state === InboxState.RECEIVED ||
        r.state === InboxState.DEFERRED || // surfaced so ordering logic can report/defer
        InboxStateMachine.retryDue(r, now);
      if (!actionable) continue;
      if (!best || r.receivedAt < best.receivedAt) best = r;
    }
    // DEFERRED records are never directly actionable — filter unless the
    // caller will immediately re-defer (processNext handles that).
    if (best && best.state === InboxState.DEFERRED) {
      // Only surface it if its sequence is now due; else skip.
      const expected = this._nextSeq.get(consumer) ?? 1;
      if (best.sequence === undefined || best.sequence > expected) {
        // look for a non-deferred alternative
        let alt: InboxRecord | undefined;
        for (const id of set) {
          const r = this._records.get(id);
          if (!r || r === best) continue;
          const actionable = r.state === InboxState.RECEIVED || InboxStateMachine.retryDue(r, now);
          if (actionable && (!alt || r.receivedAt < alt.receivedAt)) alt = r;
        }
        return alt ?? (best.sequence !== undefined && best.sequence <= expected ? best : undefined);
      }
    }
    return best;
  }

  /** Re-drive a PARKED record back to RECEIVED (operator intervention). */
  redrive(recordId: string): void {
    const r = this._records.get(recordId);
    if (!r) {
      throw new InboxPatternError(InboxPatternErrorCode.RECORD_NOT_FOUND, `record not found: ${recordId}`);
    }
    InboxStateMachine.release(r);
    r.attempts = 0;
    r.parkedReason = undefined;
    this._statsFor(r.consumer).pending++;
    this._statsFor(r.consumer).parked--;
  }

  /** Retention sweep: drop PROCESSED (and optionally PARKED) records
   *  older than retentionMs. Returns count removed. */
  cleanup(now: number = this._now()): number {
    if (this._config.retentionMs <= 0) return 0;
    const cutoff = now - this._config.retentionMs;
    const doomed: string[] = [];
    for (const [id, r] of this._records) {
      if (r.state === InboxState.PROCESSED && (r.processedAt ?? r.receivedAt) < cutoff) {
        doomed.push(id);
      }
    }
    for (const id of doomed) this._drop(id);
    return doomed.length;
  }

  private _drop(id: string): void {
    const r = this._records.get(id);
    if (!r) return;
    this._records.delete(id);
    this._byKey.delete(this._key(r.consumer, r.messageId));
    const set = this._byConsumer.get(r.consumer);
    if (set) {
      set.delete(id);
      if (set.size === 0) this._byConsumer.delete(r.consumer);
    }
  }

  // ------------------------------------------------------------------
  // Queries
  // ------------------------------------------------------------------

  get(recordId: string): InboxRecord | undefined {
    return this._records.get(recordId);
  }

  findByMessageId(consumer: string, messageId: string): InboxRecord | undefined {
    const id = this._byKey.get(this._key(consumer, messageId));
    return id !== undefined ? this._records.get(id) : undefined;
  }

  listByConsumer(consumer: string, state?: InboxState): InboxRecord[] {
    const set = this._byConsumer.get(consumer);
    if (!set) return [];
    const out: InboxRecord[] = [];
    for (const id of set) {
      const r = this._records.get(id);
      if (r && (state === undefined || r.state === state)) out.push(r);
    }
    return out.sort((a, b) => a.receivedAt - b.receivedAt);
  }

  parked(consumer: string): InboxRecord[] {
    return this.listByConsumer(consumer, InboxState.PARKED);
  }

  stats(consumer: string): ConsumerStats {
    return { ...this._statsFor(consumer) };
  }

  size(): number {
    return this._records.size;
  }
}
