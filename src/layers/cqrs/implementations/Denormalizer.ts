/**
 * DenormalizerPipeline — event → read model projection pipeline.
 *
 * In CQRS, the write side emits domain events and the read side projects
 * them into queryable denormalized state. A `Denormalizer` is the binding
 * between an event type and a projection function: each incoming event is
 * routed to every denormalizer registered for its type and the resulting
 * projection operations (upsert / delete / patch) are applied to a
 * `ProjectionTarget`.
 *
 * Real-world concerns handled here:
 *  - Fan-out: one event may feed N read models (e.g. an `OrderPlaced`
 *    event updates OrderSummary, CustomerHistory, and InventoryView).
 *  - Ordering: a global position guarantees at-least-once delivery order;
 *    the pipeline deduplicates by (denormalizer, eventId).
 *  - Failures: a failing denormalizer does not block others; errors are
 *    collected into a `ProjectionReport` and surfaced.
 *  - Checkpointing: each denormalizer records its last-applied position
 *    so it can resume after restart or rebuild.
 *
 * Events carry a monotonically increasing `position`; projections are
 * expected to be idempotent under replay.
 *
 * @module CqrsLayer/Implementations
 */

// ------------------------------------------------------------------ types

/** Domain event envelope consumed by the pipeline. */
export interface ProjectionEvent<TData = unknown> {
  /** Unique event id. */
  readonly eventId: string;
  /** Discriminator, e.g. 'account.opened'. */
  readonly type: string;
  /** Owning stream / aggregate id. */
  readonly aggregateId: string;
  /** Version of the aggregate AFTER this event. */
  readonly aggregateVersion: number;
  /** Global monotonic position across all streams. */
  readonly position: number;
  /** Event payload. */
  readonly data: TData;
  /** Producer-supplied metadata (correlationId, causationId, userId...). */
  readonly metadata: Record<string, unknown>;
  /** Wall-clock emit time. */
  readonly timestamp: number;
}

/**
 * Operations a denormalizer emits against a target. A target is a single
 * logical read model (e.g. "orders summary table").
 */
export type ProjectionOp =
  | { kind: 'upsert'; id: string; document: Record<string, unknown>; expectedVersion?: number }
  | { kind: 'patch'; id: string; patch: Record<string, unknown>; expectedVersion?: number }
  | { kind: 'delete'; id: string; expectedVersion?: number };

/** A projection target — one logical read-model store. */
export interface ProjectionTarget {
  /** Target name, used in reports and checkpoints. */
  readonly name: string;
  /** Apply a batch of operations atomically. */
  apply(ops: ProjectionOp[]): Promise<void> | void;
  /** Read a document back — used by tests and consistency checks. */
  get(id: string): Record<string, unknown> | undefined;
  /** Optional — clear all state for a full rebuild. */
  clear?(): Promise<void> | void;
}

/**
 * A denormalizer transforms an event into ops against one target.
 * Return `[]` to skip the event (e.g. filtered projections).
 */
export type DenormalizerFn = (
  event: ProjectionEvent,
  ctx: DenormalizeContext,
) => ProjectionOp[] | Promise<ProjectionOp[]>;

export interface DenormalizeContext {
  /** Name of the owning target. */
  readonly target: string;
  /** Last successfully applied position for this denormalizer. */
  readonly lastPosition: number;
}

/** One registered denormalizer. */
export interface Denormalizer {
  /** Stable name — used in checkpoints + dedup. */
  readonly name: string;
  /** Event types this denormalizer handles ('*' for all). */
  readonly eventTypes: string[];
  /** Target read model to write to. */
  readonly target: ProjectionTarget;
  /** Projection function. */
  readonly project: DenormalizerFn;
  /** Optional filter — cheap pre-check before invoking project(). */
  readonly filter?: (event: ProjectionEvent) => boolean;
}

/** Per-denormalizer outcome for a batch. */
export interface DenormalizerResult {
  readonly name: string;
  opsApplied: number;
  eventsProcessed: number;
  errors: Array<{ eventId: string; error: Error }>;
  lastPosition: number;
}

/** Full report for `processEvents`. */
export interface ProjectionReport {
  readonly results: DenormalizerResult[];
  readonly totalEvents: number;
  readonly totalOps: number;
  readonly totalErrors: number;
  readonly elapsedMs: number;
  /** Highest position observed across the batch (0 if no events). */
  readonly maxPosition: number;
}

// --------------------------------------------------------------- pipeline

export class DenormalizerPipeline {
  private readonly _denormalizers: Denormalizer[] = [];
  private readonly _byType = new Map<string, Denormalizer[]>();
  private readonly _checkpoints = new Map<string, number>();
  private readonly _seenEvents = new Map<string, Set<string>>(); // denormName -> eventIds
  private readonly _seenLimit: number;

  constructor(options: { seenEventCacheSize?: number } = {}) {
    this._seenLimit = options.seenEventCacheSize ?? 10_000;
  }

  /** Register a denormalizer. */
  register(denormalizer: Denormalizer): this {
    this._denormalizers.push(denormalizer);
    for (const t of denormalizer.eventTypes) {
      let list = this._byType.get(t);
      if (!list) {
        list = [];
        this._byType.set(t, list);
      }
      list.push(denormalizer);
    }
    this._checkpoints.set(denormalizer.name, this._checkpoints.get(denormalizer.name) ?? 0);
    return this;
  }

  /** All registered denormalizers. */
  registered(): readonly Denormalizer[] {
    return this._denormalizers;
  }

  /** Last applied position for a denormalizer. */
  checkpoint(name: string): number {
    return this._checkpoints.get(name) ?? 0;
  }

  /**
   * Process a single event — fan out to every applicable denormalizer.
   * Returns the number of ops applied.
   */
  async processEvent(event: ProjectionEvent): Promise<number> {
    const report = await this.processEvents([event]);
    return report.totalOps;
  }

  /**
   * Process an event batch. Order is the array order — callers should
   * sort by `position` before invoking. Returns per-denormalizer results.
   */
  async processEvents(events: readonly ProjectionEvent[]): Promise<ProjectionReport> {
    const start = Date.now();
    const results = new Map<string, DenormalizerResult>();
    const getResult = (name: string): DenormalizerResult => {
      let r = results.get(name);
      if (!r) {
        r = {
          name,
          opsApplied: 0,
          eventsProcessed: 0,
          errors: [],
          lastPosition: this._checkpoints.get(name) ?? 0,
        };
        results.set(name, r);
      }
      return r;
    };

    let totalOps = 0;
    let maxPos = 0;

    for (const event of events) {
      if (event.position > maxPos) maxPos = event.position;

      // Find applicable denormalizers — type-specific plus wildcard.
      const applicable = new Set<Denormalizer>();
      for (const d of this._byType.get(event.type) ?? []) applicable.add(d);
      for (const d of this._byType.get('*') ?? []) applicable.add(d);

      for (const d of applicable) {
        // Deduplicate: don't apply an event twice to the same denormalizer.
        if (this._hasSeen(d.name, event.eventId)) continue;

        // Cheap filter before doing work.
        if (d.filter && !d.filter(event)) continue;

        const r = getResult(d.name);
        r.eventsProcessed += 1;
        const ctx: DenormalizeContext = {
          target: d.target.name,
          lastPosition: this._checkpoints.get(d.name) ?? 0,
        };
        try {
          const ops = await d.project(event, ctx);
          if (ops.length > 0) {
            await d.target.apply(ops);
            r.opsApplied += ops.length;
            totalOps += ops.length;
          }
          if (event.position > r.lastPosition) r.lastPosition = event.position;
        } catch (e) {
          r.errors.push({
            eventId: event.eventId,
            error: e instanceof Error ? e : new Error(String(e)),
          });
        }
        this._markSeen(d.name, event.eventId);
      }
    }

    // Persist checkpoints — only advance on success (no errors for that denorm).
    let totalErrors = 0;
    for (const r of results.values()) {
      totalErrors += r.errors.length;
      if (r.errors.length === 0 && r.lastPosition > (this._checkpoints.get(r.name) ?? 0)) {
        this._checkpoints.set(r.name, r.lastPosition);
      }
    }

    return {
      results: [...results.values()],
      totalEvents: events.length,
      totalOps,
      totalErrors,
      elapsedMs: Date.now() - start,
      maxPosition: maxPos,
    };
  }

  /**
   * Reset a denormalizer — clears its target (if supported) and resets the
   * checkpoint so the next replay rebuilds from scratch.
   */
  async reset(name: string): Promise<void> {
    const d = this._denormalizers.find((x) => x.name === name);
    if (!d) throw new Error(`Unknown denormalizer '${name}'`);
    if (d.target.clear) await d.target.clear();
    this._checkpoints.set(name, 0);
    this._seenEvents.delete(name);
  }

  /**
   * Replay a set of events starting at a position. Used to rebuild a
   * projection after a schema change or corruption.
   */
  async rebuild(name: string, events: readonly ProjectionEvent[]): Promise<ProjectionReport> {
    await this.reset(name);
    const sorted = [...events].sort((a, b) => a.position - b.position);
    return this.processEvents(sorted);
  }

  /** Forget dedup state — e.g. after a full replay. */
  clearDedup(): void {
    this._seenEvents.clear();
  }

  // ------------------------------------------------------------- internal

  private _hasSeen(name: string, eventId: string): boolean {
    const set = this._seenEvents.get(name);
    return set ? set.has(eventId) : false;
  }

  private _markSeen(name: string, eventId: string): void {
    let set = this._seenEvents.get(name);
    if (!set) {
      set = new Set();
      this._seenEvents.set(name, set);
    }
    set.add(eventId);
    // Bounded memory: evict ~oldest 10% when over limit. Sets preserve
    // insertion order, so first entries are the oldest.
    if (set.size > this._seenLimit) {
      const toDrop = Math.max(1, Math.floor(this._seenLimit / 10));
      const it = set.values();
      for (let i = 0; i < toDrop; i++) {
        const next = it.next();
        if (next.done) break;
        set.delete(next.value);
      }
    }
  }
}
