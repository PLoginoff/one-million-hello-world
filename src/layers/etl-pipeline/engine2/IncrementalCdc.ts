/**
 * Incremental CDC Processing — resumable change capture with position
 * tracking and at-least-once delivery semantics.
 *
 * Complements `engine/CdcEngine` (a state-store/apply layer): this is
 * the *stream-walker* that:
 *
 *   - reads a source `ChangeLog` (any ordered source: WAL tail, Kafka,
 *     a polling query against an updated_at column);
 *   - batches changes up to `batchSize`, applies them to a sink, then
 *     durably commits the position — crash-resume picks up at the last
 *     committed position (at-least-once);
 *   - deduplicates redelivered events within a window (idempotent apply
 *     via a position-keyed dedup set for sources that redeliver);
 *   - supports a `savepoint()`/`restore()` for external checkpointing.
 *
 * @module EtlPipeline/Engine2
 */

import { CdcEvent } from '../engine/CdcEngine';

/** Ordered source of change events. */
export interface IChangeLog {
  /** Fetch up to `n` events strictly after `position`. */
  fetch(afterPosition: number, n: number): readonly CdcEvent[];
  /** Highest position currently readable. */
  highWaterMark(): number;
}

/** Where applied changes go. */
export interface IChangeSink {
  apply(events: readonly CdcEvent[]): void | Promise<void>;
}

/** Persistent position store — swap for a KV/DB-backed one in prod. */
export interface IPositionStore {
  load(): number;
  save(position: number): void;
}

export class MemoryPositionStore implements IPositionStore {
  private pos: number;
  constructor(initial = 0) {
    this.pos = initial;
  }
  load(): number {
    return this.pos;
  }
  save(position: number): void {
    this.pos = position;
  }
}

export interface CdcRunReport {
  readonly fromPosition: number;
  readonly toPosition: number;
  readonly eventsApplied: number;
  /** Events dropped as redeliveries of already-applied positions. */
  readonly duplicatesDropped: number;
  readonly batches: number;
}

export interface IncrementalOptions {
  readonly batchSize?: number;
  /** Bound the dedup window (positions kept). Default 10_000. */
  readonly dedupWindowSize?: number;
}

export class IncrementalCdcProcessor {
  private readonly batchSize: number;
  private readonly dedupWindow: number;
  private readonly seen = new Map<number, true>(); // bounded dedup set
  private position: number;

  constructor(
    private readonly log: IChangeLog,
    private readonly sink: IChangeSink,
    private readonly store: IPositionStore = new MemoryPositionStore(),
    options: IncrementalOptions = {}
  ) {
    this.batchSize = options.batchSize ?? 500;
    this.dedupWindow = options.dedupWindowSize ?? 10_000;
    this.position = store.load();
  }

  /** Current committed position. */
  get committedPosition(): number {
    return this.position;
  }

  /**
   * Drain all available events to the high-water mark, in batches.
   * Position commits after each successful batch — a crash mid-batch
   * redelivers it (at-least-once); the dedup set filters re-runs.
   */
  async run(): Promise<CdcRunReport> {
    const from = this.position;
    let applied = 0;
    let dup = 0;
    let batches = 0;

    for (;;) {
      const batch = this.log.fetch(this.position, this.batchSize);
      if (batch.length === 0) break;
      const fresh: CdcEvent[] = [];
      const batchSeen = new Set<number>(); // within-batch dedup too
      for (const e of batch) {
        if (this.seen.has(e.position) || batchSeen.has(e.position)) {
          dup++;
          continue;
        }
        batchSeen.add(e.position);
        fresh.push(e);
      }
      if (fresh.length > 0) {
        await this.sink.apply(fresh);
        for (const e of fresh) {
          this.seen.set(e.position, true);
          if (e.position > this.position) this.position = e.position;
        }
        applied += fresh.length;
      } else {
        // Whole batch was duplicates — still advance position.
        const max = Math.max(...batch.map((e) => e.position));
        if (max > this.position) this.position = max;
      }
      this.store.save(this.position);
      batches++;
      this.evictDedup();
      if (batch.length < this.batchSize) break;
    }
    return { fromPosition: from, toPosition: this.position, eventsApplied: applied, duplicatesDropped: dup, batches };
  }

  /** Serializable savepoint for external checkpointing. */
  savepoint(): { position: number; seen: number[] } {
    return { position: this.position, seen: [...this.seen.keys()] };
  }

  restore(s: { position: number; seen: number[] }): void {
    this.position = s.position;
    this.seen.clear();
    for (const p of s.seen) this.seen.set(p, true);
    this.store.save(s.position);
  }

  private evictDedup(): void {
    if (this.seen.size <= this.dedupWindow) return;
    // Keep only the most recent window.
    const cutoff = this.position - this.dedupWindow;
    for (const k of this.seen.keys()) {
      if (k < cutoff) this.seen.delete(k);
    }
  }
}

/** Simple in-memory change log for tests and local pipelines. */
export class ArrayChangeLog implements IChangeLog {
  private events: CdcEvent[] = [];
  push(e: CdcEvent): void {
    this.events.push(e);
  }
  pushAll(es: readonly CdcEvent[]): void {
    this.events.push(...es);
  }
  fetch(afterPosition: number, n: number): readonly CdcEvent[] {
    // Events assumed sorted by position; filter > afterPosition.
    const out: CdcEvent[] = [];
    for (const e of this.events) {
      if (e.position > afterPosition) out.push(e);
      if (out.length >= n) break;
    }
    return out;
  }
  highWaterMark(): number {
    return this.events.length > 0 ? this.events[this.events.length - 1].position : 0;
  }
}

/** Collect applied events into memory (test sink). */
export class CollectingSink implements IChangeSink {
  readonly applied: CdcEvent[] = [];
  apply(events: readonly CdcEvent[]): void {
    this.applied.push(...events);
  }
}
