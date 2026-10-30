/**
 * InboxArchiver — archive old processed records, replay history.
 *
 * The engine's `cleanup()` drops aged PROCESSED records outright. Real
 * inboxes need an audit trail: archive them first into a compact
 * tombstone store, THEN delete from the hot store.
 *
 * Archive record: the record's final state plus enough metadata to
 * reconstruct its processing history — receivedAt, processedAt,
 * attempts, lastError. Payloads are optionally retained (can be large).
 *
 * Replay: the archive doubles as the replay source — `replay()` takes
 * archived records and re-injects them into the engine as fresh
 * messages (new messageId suffix so they don't dedup-collide with the
 * originals), for bug-fix reprocessing or consumer rebuilds.
 *
 * @module Inbox/Engine2
 */

import { InboxEngine } from '../pattern/InboxEngine';
import type { MessageHandler } from '../pattern/types';
import { InboxState } from '../pattern/types';
import type { InboxRecord } from '../pattern/types';

// ------------------------------------------------------------------ archive

/** A tombstoned record — what remains after hot-store cleanup. */
export interface ArchivedRecord {
  readonly originalId: string;
  readonly consumer: string;
  readonly messageId: string;
  readonly receivedAt: number;
  readonly processedAt?: number;
  readonly attempts: number;
  readonly finalState: InboxState;
  readonly lastError?: string;
  /** Payload kept only when `retainPayloads` is true. */
  readonly payload?: unknown;
  readonly archivedAt: number;
}

/** Query filter over the archive. */
export interface ArchiveQuery {
  readonly consumer?: string;
  readonly before?: number;
  readonly after?: number;
  readonly states?: InboxState[];
  readonly limit?: number;
}

/** In-memory archive store — the audit/history side. */
export class InboxArchive {
  private readonly _records: ArchivedRecord[] = [];
  private _byOriginalId = new Map<string, ArchivedRecord>();

  /** Store an archived record. */
  put(rec: ArchivedRecord): void {
    this._records.push(rec);
    this._byOriginalId.set(rec.originalId, rec);
  }

  /** Fetch by original inbox record id. */
  byOriginalId(id: string): ArchivedRecord | undefined {
    return this._byOriginalId.get(id);
  }

  /** Query archived records. */
  query(q: ArchiveQuery = {}): ArchivedRecord[] {
    let out = this._records;
    if (q.consumer) out = out.filter((r) => r.consumer === q.consumer);
    if (q.after !== undefined) out = out.filter((r) => r.archivedAt >= q.after!);
    if (q.before !== undefined) out = out.filter((r) => r.archivedAt <= q.before!);
    if (q.states) out = out.filter((r) => q.states!.includes(r.finalState));
    if (q.limit !== undefined) out = out.slice(0, q.limit);
    return out;
  }

  get size(): number {
    return this._records.length;
  }
}

// ------------------------------------------------------------------ archiver

/** Cleanup policy. */
export interface ArchivePolicy {
  /** Archive+drop PROCESSED records older than this (ms). */
  processedOlderThanMs: number;
  /** Also archive PARKED records older than this (0 = keep). */
  parkedOlderThanMs: number;
  /** Retain message payloads in the archive (default true). */
  retainPayloads: boolean;
}

const DEFAULT_ARCHIVE_POLICY: ArchivePolicy = {
  processedOlderThanMs: 24 * 3600_000,
  parkedOlderThanMs: 7 * 24 * 3600_000,
  retainPayloads: true,
};

/** Cleanup report. */
export interface ArchiveSweepResult {
  readonly archived: number;
  readonly droppedFromHot: number;
  readonly byState: Record<string, number>;
}

export class InboxArchiver {
  private readonly _engine: InboxEngine;
  private readonly _archive: InboxArchive;
  private readonly _policy: ArchivePolicy;
  private readonly _now: () => number;

  constructor(engine: InboxEngine, archive: InboxArchive, policy: Partial<ArchivePolicy> = {}, now: () => number = Date.now) {
    this._engine = engine;
    this._archive = archive;
    this._policy = { ...DEFAULT_ARCHIVE_POLICY, ...policy };
    this._now = now;
  }

  /**
   * Archive aged terminal records, then let the engine's own retention
   * (`cleanup()`) drop what its `retentionMs` policy says is due.
   *
   * The archiver decides WHAT deserves archiving by its own policy
   * (independent of engine retentionMs); the engine remains the
   * authority on actual hot-store deletion. A record can be archived
   * yet still live in the engine when engine retention is longer —
   * the archive is a tombstone/history store, not a live mirror.
   */
  sweep(consumer: string): ArchiveSweepResult {
    const now = this._now();
    const byState: Record<string, number> = {};
    let archived = 0;

    // Find candidates BEFORE cleanup removes them.
    const records = this._engine.listByConsumer(consumer);
    const toArchive: InboxRecord[] = [];
    for (const r of records) {
      if (r.state === InboxState.PROCESSED && r.processedAt !== undefined && now - r.processedAt >= this._policy.processedOlderThanMs) {
        toArchive.push(r);
      } else if (
        r.state === InboxState.PARKED &&
        this._policy.parkedOlderThanMs > 0 &&
        (r.processedAt ?? r.receivedAt) !== undefined &&
        now - (r.processedAt ?? r.receivedAt) >= this._policy.parkedOlderThanMs
      ) {
        toArchive.push(r);
      }
    }

    for (const r of toArchive) {
      this._archive.put({
        originalId: r.id,
        consumer: r.consumer,
        messageId: r.messageId,
        receivedAt: r.receivedAt,
        processedAt: r.processedAt,
        attempts: r.attempts,
        finalState: r.state,
        lastError: r.lastError ?? r.parkedReason,
        payload: this._policy.retainPayloads ? r.payload : undefined,
        archivedAt: now,
      });
      byState[r.state] = (byState[r.state] ?? 0) + 1;
      archived++;
    }

    // Engine enforces its own retentionMs on PROCESSED records.
    const dropped = this._engine.cleanup(now);

    return { archived, droppedFromHot: dropped, byState };
  }

  get archive(): InboxArchive {
    return this._archive;
  }
}

// ------------------------------------------------------------------ replay

/** Replay outcome. */
export interface ReplayResult {
  readonly replayed: number;
  /** New record ids created by the replay. */
  readonly newRecordIds: string[];
  readonly skipped: Array<{ originalId: string; reason: string }>;
}

/**
 * Replays archived records back through the engine as fresh messages.
 *
 * messageId strategy: `<original>::replay::<epoch>` — replays don't
 * collide with the original dedup key, and multiple replays of the same
 * original get distinct ids.
 */
export class InboxReplayer {
  private readonly _engine: InboxEngine;
  private readonly _archive: InboxArchive;
  private readonly _now: () => number;

  constructor(engine: InboxEngine, archive: InboxArchive, now: () => number = Date.now) {
    this._engine = engine;
    this._archive = archive;
    this._now = now;
  }

  /**
   * Re-inject archived records matching `q` into the engine.
   * `process` optionally drains them immediately through a handler.
   */
  async replay(q: ArchiveQuery = {}, handler?: MessageHandler): Promise<ReplayResult> {
    const candidates = this._archive.query(q);
    const newRecordIds: string[] = [];
    const skipped: ReplayResult['skipped'] = [];
    const epoch = this._now();

    for (const rec of candidates) {
      if (rec.payload === undefined) {
        skipped.push({ originalId: rec.originalId, reason: 'payload not retained' });
        continue;
      }
      const newId = `${rec.messageId}::replay::${epoch}`;
      const res = this._engine.receive(rec.consumer, newId, rec.payload);
      if (res.duplicate) {
        skipped.push({ originalId: rec.originalId, reason: 'replay id already exists (dedup)' });
        continue;
      }
      newRecordIds.push(res.record.id);
    }

    if (handler) {
      // Drain per consumer — replays may span consumers.
      const consumers = new Set(candidates.map((r) => r.consumer));
      for (const c of consumers) {
        await this._engine.processAll(c, handler);
      }
    }

    return { replayed: newRecordIds.length, newRecordIds, skipped };
  }
}
