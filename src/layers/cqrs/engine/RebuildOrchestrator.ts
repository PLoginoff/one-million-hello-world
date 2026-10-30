/**
 * RebuildOrchestrator — re-run projections from the event log.
 *
 * A rebuild is needed when a projection's code changes (new fields, fixed
 * bug, new read model): clear the target model, rewind the checkpoint to
 * -1, replay every event through the projector, then resume live processing.
 *
 *   orchestrator.rebuildAll(['orders', 'customers'], events)
 *     → per-projection: clear model → checkpoint=-1 → replay in batches
 *       → report { eventsApplied, ms, ops/s }
 *
 * Details that matter in production:
 *   - Bounded concurrency: projections rebuild in parallel with a worker
 *     pool (default 4) — I/O-bound work benefits, CPU-bound fold doesn't.
 *   - Batch application: events replay in chunks of `batchSize` and each
 *     chunk's ops + checkpoint move atomically via `store.applyBatch` —
 *     a crash mid-rebuild resumes from the last committed checkpoint.
 *   - Progress callbacks: `onProgress(projection, done, total)` after each
 *     batch — enough for a progress bar or "rebuild 43%" status endpoint.
 *   - Failure isolation: one failing projection doesn't abort the others;
 *     per-projection errors land in the report.
 *   - `readDuringRebuild`: when true the model is NOT cleared first —
 *     rebuild writes over live data (eventual convergence, no downtime);
 *     when false the model is emptied first (clean state, brief gap).
 *
 * @module CqrsLayer/Engine
 */

import { ReadModelStore } from './ReadModelStore';
import { ProjectionEvent } from '../implementations/Denormalizer';
import { IClock, SystemClock } from '../../observability/engine/signals';

/** A rebuildable projection definition. */
export interface RebuildableProjection {
  /** Stable name (checkpoint key). */
  readonly name: string;
  /** Read model it writes to. */
  readonly model: string;
  /** Event types it consumes; others are skipped during replay. */
  readonly eventTypes: readonly string[];
  /** Turn an event into ops — same signature as Denormalizer.project but
   *  simplified: no ctx needed during rebuild. */
  readonly project: (event: ProjectionEvent) =>
    | import('../implementations/Denormalizer').ProjectionOp[]
    | Promise<import('../implementations/Denormalizer').ProjectionOp[]>;
}

export interface RebuildProgress {
  readonly projection: string;
  readonly eventsDone: number;
  readonly eventsTotal: number;
}

export interface ProjectionRebuildResult {
  readonly projection: string;
  readonly eventsScanned: number;
  readonly eventsApplied: number;
  readonly opsWritten: number;
  readonly elapsedMs: number;
  readonly errors: string[];
  readonly finalCheckpoint: number;
}

export interface RebuildOptions {
  readonly concurrency?: number;
  readonly batchSize?: number;
  /** Skip clearing the model first (live-rebuild over existing data). */
  readonly readDuringRebuild?: boolean;
  readonly onProgress?: (p: RebuildProgress) => void;
}

export class RebuildOrchestrator {
  private readonly _store: ReadModelStore;
  private readonly _clock: IClock;

  constructor(store: ReadModelStore, clock: IClock = new SystemClock()) {
    this._store = store;
    this._clock = clock;
  }

  /**
   * Rebuild one projection over `events` (already in global order).
   */
  async rebuild(
    projection: RebuildableProjection,
    events: readonly ProjectionEvent[],
    options: RebuildOptions = {}
  ): Promise<ProjectionRebuildResult> {
    const started = this._clock.nowMs();
    const batchSize = Math.max(1, options.batchSize ?? 500);
    const errors: string[] = [];

    if (!options.readDuringRebuild) {
      this._store.prepareRebuild(projection.name, projection.model);
    } else {
      this._store.resetCheckpoint(projection.name);
    }

    const typeSet = new Set(projection.eventTypes);
    const relevant = events.filter((e) => typeSet.has(e.type) || typeSet.has('*'));

    let applied = 0;
    let opsWritten = 0;
    let checkpoint = -1;

    for (let i = 0; i < relevant.length; i += batchSize) {
      const chunk = relevant.slice(i, i + batchSize);
      const ops: import('../implementations/Denormalizer').ProjectionOp[] = [];
      for (const e of chunk) {
        try {
          const produced = await projection.project(e);
          ops.push(...produced);
        } catch (err) {
          errors.push(
            `event ${e.eventId}@${e.position}: ` +
              (err instanceof Error ? err.message : String(err))
          );
        }
      }
      const maxPos = chunk.reduce((m, e) => Math.max(m, e.position), checkpoint);
      try {
        this._store.applyBatch(projection.name, maxPos, projection.model, ops);
        checkpoint = maxPos;
        opsWritten += ops.length;
        applied += chunk.length;
      } catch (err) {
        errors.push(
          `batch @${i}: ` + (err instanceof Error ? err.message : String(err))
        );
      }
      options.onProgress?.({
        projection: projection.name,
        eventsDone: Math.min(i + batchSize, relevant.length),
        eventsTotal: relevant.length,
      });
    }

    return {
      projection: projection.name,
      eventsScanned: events.length,
      eventsApplied: applied,
      opsWritten,
      elapsedMs: this._clock.nowMs() - started,
      errors,
      finalCheckpoint: checkpoint,
    };
  }

  /**
   * Rebuild several projections in parallel over the SAME event log —
   * the log is scanned once per projection (each filters its own types),
   * so an EventStore-side replay is the usual source for `events`.
   *
   * Concurrency: a simple index-counter worker pool, same pattern as
   * CacheWarmer — deterministic and dependency-free.
   */
  async rebuildAll(
    projections: readonly RebuildableProjection[],
    events: readonly ProjectionEvent[],
    options: RebuildOptions = {}
  ): Promise<ProjectionRebuildResult[]> {
    const concurrency = Math.max(1, options.concurrency ?? 4);
    const results: (ProjectionRebuildResult | null)[] = new Array(projections.length).fill(null);
    let index = 0;

    const worker = async (): Promise<void> => {
      for (;;) {
        const i = index++;
        if (i >= projections.length) return;
        const proj = projections[i];
        try {
          results[i] = await this.rebuild(proj, events, options);
        } catch (err) {
          results[i] = {
            projection: proj.name,
            eventsScanned: events.length,
            eventsApplied: 0,
            opsWritten: 0,
            elapsedMs: 0,
            errors: [err instanceof Error ? err.message : String(err)],
            finalCheckpoint: -1,
          };
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, projections.length) }, worker)
    );
    return results as ProjectionRebuildResult[];
  }
}
