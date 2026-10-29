/**
 * ProjectionUpdater — apply / rebuild / replay engines for projections.
 *
 * Three distinct modes:
 *   - APPLY:   process new events as they arrive (live tail of the log)
 *   - REBUILD: clear the projection and re-apply all events from scratch
 *   - REPLAY:  apply a historical range without clearing (e.g. to recover
 *              a corrupted range or backfill a new field)
 *
 * Each `Projection` binds a name + target collection + event handler map.
 * The updater maintains a per-projection checkpoint (`appliedPosition`)
 * which is the highest global event position the projection has consumed.
 *
 * Error handling: a failing event handler does not abort the batch. The
 * updater records the error and continues — the checkpoint is NOT
 * advanced past the failed position, so a subsequent replay re-attempts
 * the failed events.
 *
 * @module ReadModelLayer/Implementations
 */

import { Collection, ProjectionStore } from './ProjectionStore';

// ------------------------------------------------------------------ types

/** Event envelope consumed by updaters — mirrors the write-side shape. */
export interface ReadModelEvent<TData = unknown> {
  readonly eventId: string;
  readonly type: string;
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  /** Global monotonic position across all streams. */
  readonly position: number;
  readonly data: TData;
  readonly metadata: Record<string, unknown>;
  readonly timestamp: number;
}

/** Per-event-type handler. Mutates the projection collection. */
export type EventHandler<TData = Record<string, unknown>> = (
  event: ReadModelEvent,
  collection: Collection<TData>,
) => void | Promise<void>;

/**
 * A Projection declaration: name + target collection + handler map.
 * Handlers keyed by event type; `'*'` is a catch-all.
 */
export interface Projection<TData = Record<string, unknown>> {
  readonly name: string;
  /** Target collection name in the store. */
  readonly collectionName: string;
  /** Handlers by event type (supports '*' wildcard). */
  readonly handlers: Record<string, EventHandler<TData>>;
}

/** Per-projection outcome of one apply/rebuild/replay call. */
export interface UpdateOutcome {
  readonly projection: string;
  readonly mode: 'apply' | 'rebuild' | 'replay';
  readonly eventsProcessed: number;
  readonly eventsSkipped: number;
  readonly errors: Array<{ eventId: string; error: Error }>;
  /** Checkpoint after this call (position of last successful event). */
  readonly appliedPosition: number;
  readonly elapsedMs: number;
}

// ---------------------------------------------------------------- updater

export class ProjectionUpdater {
  private readonly _store: ProjectionStore;
  private readonly _projections = new Map<string, Projection>();
  private readonly _checkpoints = new Map<string, number>();

  constructor(store: ProjectionStore) {
    this._store = store;
  }

  /** Register a projection. */
  register<TData>(projection: Projection<TData>): this {
    if (this._projections.has(projection.name)) {
      throw new Error(`Projection '${projection.name}' already registered`);
    }
    this._projections.set(projection.name, projection as Projection);
    this._checkpoints.set(projection.name, 0);
    return this;
  }

  /** Checkpoint for a projection (0 = never applied). */
  checkpoint(name: string): number {
    return this._checkpoints.get(name) ?? 0;
  }

  /** Registered projection names. */
  registered(): string[] {
    return [...this._projections.keys()];
  }

  /**
   * APPLY: process a batch of new events. Events at or below the
   * projection's checkpoint are skipped (idempotent replay safety).
   */
  async apply(name: string, events: readonly ReadModelEvent[]): Promise<UpdateOutcome> {
    return this._run(name, events, 'apply', false);
  }

  /**
   * REBUILD: clear the target collection, reset checkpoint, apply all
   * supplied events. Used when a projection's schema changes.
   */
  async rebuild(name: string, events: readonly ReadModelEvent[]): Promise<UpdateOutcome> {
    const p = this._get(name);
    const collection = this._store.collection(p.collectionName);
    collection.clear();
    this._checkpoints.set(name, 0);
    // Sort by position — a rebuild is only correct in commit order.
    const sorted = [...events].sort((a, b) => a.position - b.position);
    return this._run(name, sorted, 'rebuild', false);
  }

  /**
   * REPLAY: apply events in a position range WITHOUT clearing. Ignores
   * the checkpoint filter (events <= checkpoint are still processed).
   * Useful for backfilling or repairing.
   */
  async replay(
    name: string,
    events: readonly ReadModelEvent[],
    options: { fromPosition?: number; toPosition?: number } = {},
  ): Promise<UpdateOutcome> {
    const from = options.fromPosition ?? 0;
    const to = options.toPosition ?? Number.MAX_SAFE_INTEGER;
    const filtered = events.filter((e) => e.position >= from && e.position <= to);
    const sorted = filtered.sort((a, b) => a.position - b.position);
    return this._run(name, sorted, 'replay', true);
  }

  /**
   * Catch-up: apply events from `fromPosition` (exclusive) to current
   * head. Combines apply + checkpoint filter.
   */
  async catchUp(
    name: string,
    events: readonly ReadModelEvent[],
  ): Promise<UpdateOutcome> {
    const checkpoint = this._checkpoints.get(name) ?? 0;
    const pending = events
      .filter((e) => e.position > checkpoint)
      .sort((a, b) => a.position - b.position);
    return this._run(name, pending, 'apply', false);
  }

  // ------------------------------------------------------------- internals

  private _get(name: string): Projection {
    const p = this._projections.get(name);
    if (!p) throw new Error(`Unknown projection '${name}'`);
    return p;
  }

  private async _run(
    name: string,
    events: readonly ReadModelEvent[],
    mode: 'apply' | 'rebuild' | 'replay',
    ignoreCheckpoint: boolean,
  ): Promise<UpdateOutcome> {
    const start = Date.now();
    const p = this._get(name);
    const collection = this._store.collection(p.collectionName);
    const checkpoint = this._checkpoints.get(name) ?? 0;

    let processed = 0;
    let skipped = 0;
    let lastSuccess = checkpoint;
    const errors: Array<{ eventId: string; error: Error }> = [];

    for (const event of events) {
      // Skip already-applied events unless replaying explicitly.
      if (!ignoreCheckpoint && event.position <= lastSuccess) {
        skipped += 1;
        continue;
      }
      const handler = p.handlers[event.type] ?? p.handlers['*'];
      if (!handler) {
        skipped += 1;
        // Still advance checkpoint — an unhandled event is permanently
        // unhandled; no point retrying.
        if (event.position > lastSuccess) lastSuccess = event.position;
        continue;
      }
      try {
        await handler(event, collection as Collection<Record<string, unknown>>);
        processed += 1;
        if (event.position > lastSuccess) lastSuccess = event.position;
      } catch (e) {
        errors.push({
          eventId: event.eventId,
          error: e instanceof Error ? e : new Error(String(e)),
        });
        // Do NOT advance past the failed position — retry next apply.
      }
    }

    this._checkpoints.set(name, lastSuccess);
    if (lastSuccess > 0) this._store.recordAppliedPosition(lastSuccess);

    return {
      projection: name,
      mode,
      eventsProcessed: processed,
      eventsSkipped: skipped,
      errors,
      appliedPosition: lastSuccess,
      elapsedMs: Date.now() - start,
    };
  }
}
