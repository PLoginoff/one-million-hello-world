/**
 * PriorityInbox — process high-priority messages first.
 *
 * The base `InboxEngine` drains FIFO by receivedAt; this wrapper adds
 * priority lanes: each consumer gets a per-priority queue of pending
 * record ids, and `processNext` always drains the highest non-empty
 * priority first.
 *
 * Design: rather than re-implementing dedup/lease/retry, we drive the
 * existing engine's `processRecord` — records live in the engine, the
 * wrapper only owns the priority ordering of what's NEXT.
 *
 * Priority model: integer lanes 0..N-1 (0 = highest). `receive` with a
 * priority enqueues into that lane. Starvation control: a low-priority
 * message waits at most `maxWaitMs` before being promoted one lane —
 * prevents high-priority floods starving low lanes forever (aging).
 *
 * @module Inbox/Engine2
 */

import { InboxEngine } from '../pattern/InboxEngine';
import type { MessageHandler } from '../pattern/types';
import { InboxState, ProcessOutcome } from '../pattern/types';

// ------------------------------------------------------------------ types

/** A queued item waiting for processing in a priority lane. */
interface LaneEntry {
  readonly recordId: string;
  readonly enqueuedAt: number;
}

/** Priority inbox config. */
export interface PriorityConfig {
  /** Number of priority lanes (default 3: 0=high,1=normal,2=low). */
  lanes: number;
  /** Max time a low-priority item waits before aging up a lane (ms). */
  maxWaitMs: number;
  /** Default priority when receive() doesn't specify. */
  defaultLane: number;
}

const DEFAULT_PRIORITY: PriorityConfig = { lanes: 3, maxWaitMs: 60_000, defaultLane: 1 };

/** Result of a prioritized processNext. */
export interface PriorityProcessResult {
  readonly outcome: ProcessOutcome;
  /** Which lane the record came from (undefined if nothing pending). */
  readonly lane?: number;
  readonly recordId?: string;
}

// ------------------------------------------------------------------ inbox

export class PriorityInbox {
  private readonly _engine: InboxEngine;
  private readonly _config: PriorityConfig;
  private readonly _now: () => number;
  /** consumer -> lane -> FIFO queue of record ids. */
  private readonly _lanes = new Map<string, LaneEntry[][]>();

  constructor(engine: InboxEngine, config: Partial<PriorityConfig> = {}, now: () => number = Date.now) {
    this._engine = engine;
    this._config = { ...DEFAULT_PRIORITY, ...config };
    this._now = now;
  }

  private _lanesFor(consumer: string): LaneEntry[][] {
    let lanes = this._lanes.get(consumer);
    if (!lanes) {
      lanes = Array.from({ length: this._config.lanes }, () => []);
      this._lanes.set(consumer, lanes);
    }
    return lanes;
  }

  /**
   * Receive a message at `lane` (0 = highest priority).
   * Returns the engine's ReceiveResult plus the effective lane.
   */
  receive(
    consumer: string,
    messageId: string,
    payload: unknown,
    lane?: number,
    sequence?: number,
  ): { record: ReturnType<InboxEngine['receive']>['record']; duplicate: boolean; lane: number } {
    const effectiveLane = Math.max(0, Math.min(this._config.lanes - 1, lane ?? this._config.defaultLane));
    const res = this._engine.receive(consumer, messageId, payload, sequence);
    if (!res.duplicate) {
      this._lanesFor(consumer)[effectiveLane]!.push({ recordId: res.record.id, enqueuedAt: this._now() });
    }
    return { record: res.record, duplicate: res.duplicate, lane: effectiveLane };
  }

  /**
   * Pop the next record id to process: highest non-empty lane wins;
   * aged entries (waiting > maxWaitMs) get promoted one lane.
   */
  private _nextRecordId(consumer: string): { recordId: string; lane: number } | undefined {
    const lanes = this._lanesFor(consumer);
    const now = this._now();

    // Aging pass: promote entries that waited too long.
    for (let i = lanes.length - 1; i > 0; i--) {
      const lane = lanes[i]!;
      for (let j = lane.length - 1; j >= 0; j--) {
        const e = lane[j]!;
        if (now - e.enqueuedAt >= this._config.maxWaitMs) {
          lane.splice(j, 1);
          lanes[i - 1]!.push({ recordId: e.recordId, enqueuedAt: e.enqueuedAt });
        }
      }
    }

    // Find the highest non-empty lane; skip stale/non-pending records.
    for (let i = 0; i < lanes.length; i++) {
      const lane = lanes[i]!;
      while (lane.length > 0) {
        const e = lane[0]!;
        const rec = this._engine.get(e.recordId);
        if (!rec || (rec.state !== InboxState.RECEIVED && rec.state !== InboxState.FAILED)) {
          lane.shift();
          continue;
        }
        // FAILED records must respect their backoff.
        if (rec.state === InboxState.FAILED && rec.nextAttemptAt !== undefined && rec.nextAttemptAt > now) {
          break; // head-of-line blocked; try next lane
        }
        lane.shift();
        return { recordId: e.recordId, lane: i };
      }
    }
    return undefined;
  }

  /**
   * Process the next message by priority. Uses engine.processRecord
   * directly (forced dequeue) — retries/backoff still enforced by the
   * engine; we only choose WHICH record runs.
   */
  async processNext(consumer: string, handler: MessageHandler): Promise<PriorityProcessResult> {
    const pick = this._nextRecordId(consumer);
    if (!pick) return { outcome: ProcessOutcome.NOTHING_PENDING };
    const outcome = await this._engine.processRecord(pick.recordId, handler);
    return { outcome, lane: pick.lane, recordId: pick.recordId };
  }

  /** Drain all pending (priority-ordered) up to `limit`. */
  async processAll(consumer: string, handler: MessageHandler, limit = 10_000): Promise<{ processed: number; parked: number }> {
    let processed = 0;
    let parked = 0;
    for (let i = 0; i < limit; i++) {
      const r = await this.processNext(consumer, handler);
      if (r.outcome === ProcessOutcome.PROCESSED) processed++;
      else if (r.outcome === ProcessOutcome.PARKED) parked++;
      else if (r.outcome === ProcessOutcome.NOTHING_PENDING) break;
    }
    return { processed, parked };
  }

  /** Queue depth per lane for a consumer. */
  depth(consumer: string): number[] {
    const lanes = this._lanesFor(consumer);
    const now = this._now();
    return lanes.map((lane) =>
      lane.filter((e) => {
        const r = this._engine.get(e.recordId);
        return r !== undefined && (r.state === InboxState.RECEIVED || (r.state === InboxState.FAILED && (r.nextAttemptAt ?? 0) <= now));
      }).length,
    );
  }

  /** Total pending across lanes. */
  pending(consumer: string): number {
    return this.depth(consumer).reduce((a, b) => a + b, 0);
  }

  /** Underlying engine (for stats, parked inspection, cleanup). */
  get engine(): InboxEngine {
    return this._engine;
  }
}
