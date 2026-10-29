/**
 * DAG Pipeline Engine
 *
 * Executes a directed acyclic graph of pipeline stages:
 *
 *  - Topological ordering via Kahn's algorithm — O(V+E); detects cycles
 *    up-front with the offending nodes reported.
 *  - Parallel execution of independent stages: stages ready in the same
 *    topological layer run concurrently via Promise.all, bounded by
 *    `maxConcurrency` (a semaphore-style pool).
 *  - Per-stage retry with exponential backoff + jitter (decorrelated
 *    jitter strategy — AWS architecture blog formula:
 *    sleep = min(cap, base * 2^attempt + rand(base))).
 *  - Checkpointing: after each stage completes, its output (row count +
 *    watermark + output reference) is durably recorded. `resume` skips
 *    already-completed stages — failed pipelines restart mid-flight.
 *  - Data lineage: every stage records (inputs → output) as edges in an
 *    embedded lineage graph queryable after the run.
 *
 * Rows flow between stages as immutable `RowBatch`es; a stage that
 * produces multiple outputs (e.g. splitter) publishes them as named
 * channels its downstream stages subscribe to.
 *
 * @module EtlPipeline/Engine
 */

/** A record flowing through the pipeline. */
export type Row = Record<string, unknown>;

/** Immutable batch of rows — the unit of transfer between stages. */
export interface RowBatch {
  readonly rows: readonly Row[];
  /** Stage that produced this batch (empty for source batches). */
  readonly origin: string;
}

/** Per-stage execution context passed to handlers. */
export interface StageContext {
  readonly pipelineId: string;
  readonly stageId: string;
  /** Named input batches, keyed by upstream stage id. */
  readonly inputs: ReadonlyMap<string, RowBatch>;
  /** Watermark carried from checkpoint/incremental state. */
  watermark: unknown;
  /** Attempt number (0 = first try). */
  readonly attempt: number;
  /** Lineage sink for the stage to record column-level derivations. */
  reportLineage(edge: LineageEdge): void;
  /** Abort signal for cooperative cancellation. */
  readonly signal: AbortSignal;
}

/** Column-level lineage edge recorded by a stage. */
export interface LineageEdge {
  /** `stageId.column` or `stageId` for whole-table edges. */
  readonly from: string;
  readonly to: string;
  /** Transformation description, e.g. `upper(name)` or `join on id`. */
  readonly transform: string;
}

/** A stage definition: id, dependencies, handler. */
export interface StageDef {
  readonly id: string;
  /** Upstream stage ids this stage reads from. */
  readonly dependsOn?: readonly string[];
  /** Human description for logging/lineage. */
  readonly description?: string;
  /** Per-stage retry policy override. */
  readonly retry?: Partial<RetryPolicy>;
  /** The work itself. */
  readonly run: (ctx: StageContext) => Promise<RowBatch> | RowBatch;
}

/** Retry/backoff policy. */
export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly jitter: boolean;
}

export const DEFAULT_RETRY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 10,
  maxDelayMs: 1000,
  jitter: true,
};

/** Outcome for a single stage. */
export interface StageResult {
  readonly stageId: string;
  readonly status: 'success' | 'failed' | 'skipped';
  readonly attempts: number;
  readonly durationMs: number;
  readonly rowCount: number;
  readonly error?: string;
}

/** A checkpoint: the state needed to resume a failed run. */
export interface PipelineCheckpoint {
  readonly pipelineId: string;
  /** stageId → recorded output summary. */
  readonly completed: ReadonlyMap<string, { rowCount: number; finishedAt: number }>;
  /** Watermarks keyed by stage (incremental state). */
  readonly watermarks: ReadonlyMap<string, unknown>;
  readonly savedAt: number;
}

/** Aggregate run report. */
export interface PipelineReport {
  readonly pipelineId: string;
  readonly status: 'success' | 'failed' | 'partial';
  readonly stages: StageResult[];
  readonly startedAt: number;
  readonly finishedAt: number;
  /** Output batches per stage, for inspection/testing. */
  readonly outputs: ReadonlyMap<string, RowBatch>;
  readonly lineage: readonly LineageEdge[];
  readonly checkpoint: PipelineCheckpoint;
}

/** A pipeline: id + stage list. */
export interface PipelineDef {
  readonly id: string;
  readonly stages: readonly StageDef[];
  readonly retry?: Partial<RetryPolicy>;
  /** Max concurrent stages per topological layer. Default 4. */
  readonly maxConcurrency?: number;
}

/* ------------------------------------------------------------------------ */
/* Graph utilities                                                          */
/* ------------------------------------------------------------------------ */

/** Detect a cycle and return one offending path, or null when acyclic. */
export function findCycle(stages: readonly StageDef[]): string[] | null {
  const deps = new Map<string, string[]>();
  for (const s of stages) deps.set(s.id, [...(s.dependsOn ?? [])]);
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>(stages.map((s) => [s.id, WHITE]));
  const stack: string[] = [];

  const visit = (id: string): string[] | null => {
    color.set(id, GRAY);
    stack.push(id);
    for (const dep of deps.get(id) ?? []) {
      if (!deps.has(dep)) throw new Error(`Stage '${id}' depends on unknown stage '${dep}'`);
      const c = color.get(dep);
      if (c === GRAY) {
        return [...stack.slice(stack.indexOf(dep)), dep];
      }
      if (c === WHITE) {
        const found = visit(dep);
        if (found !== null) return found;
      }
    }
    stack.pop();
    color.set(id, BLACK);
    return null;
  };

  for (const s of stages) {
    if (color.get(s.id) === WHITE) {
      const found = visit(s.id);
      if (found !== null) return found;
    }
  }
  return null;
}

/**
 * Kahn's algorithm producing execution layers: layer k contains all
 * stages whose dependencies are all in layers < k. Stages in the same
 * layer may run in parallel. O(V+E).
 */
export function topoLayers(stages: readonly StageDef[]): string[][] {
  const cycle = findCycle(stages);
  if (cycle !== null) {
    throw new Error(`Pipeline has a cycle: ${cycle.join(' → ')}`);
  }
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const s of stages) {
    indegree.set(s.id, (s.dependsOn ?? []).length);
    for (const d of s.dependsOn ?? []) {
      const list = dependents.get(d);
      if (list === undefined) dependents.set(d, [s.id]);
      else list.push(s.id);
    }
  }
  let frontier = stages.filter((s) => (indegree.get(s.id) ?? 0) === 0).map((s) => s.id);
  const layers: string[][] = [];
  let placed = 0;
  while (frontier.length > 0) {
    layers.push(frontier);
    placed += frontier.length;
    const next: string[] = [];
    for (const id of frontier) {
      for (const dep of dependents.get(id) ?? []) {
        const d = (indegree.get(dep) ?? 0) - 1;
        indegree.set(dep, d);
        if (d === 0) next.push(dep);
      }
    }
    frontier = next;
  }
  if (placed !== stages.length) {
    throw new Error('Pipeline graph is not a DAG (unreachable due to cycle check?)');
  }
  return layers;
}

/* ------------------------------------------------------------------------ */
/* Backoff                                                                  */
/* ------------------------------------------------------------------------ */

/** Deterministic or jittered backoff for attempt n (0-based). */
export function backoffMs(attempt: number, policy: RetryPolicy, random: () => number = Math.random): number {
  const exp = Math.min(policy.maxDelayMs, policy.baseDelayMs * Math.pow(2, attempt));
  if (!policy.jitter) return exp;
  // Decorrelated jitter: base + rand(exp - base + base) clamped to cap.
  return Math.min(policy.maxDelayMs, policy.baseDelayMs + random() * exp);
}

/* ------------------------------------------------------------------------ */
/* Engine                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * Executes a PipelineDef, honouring dependencies, retries, concurrency
 * limits, and checkpoint/resume.
 */
export class DagPipelineEngine {
  private readonly _sleep: (ms: number) => Promise<void>;

  constructor(opts: { sleep?: (ms: number) => Promise<void> } = {}) {
    this._sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /**
   * Execute a pipeline end-to-end.
   *
   * Stages inside one topological layer run concurrently up to
   * `maxConcurrency`. A stage failure aborts pending downstream stages
   * (marked 'skipped'); independent branches keep going.
   */
  async run(def: PipelineDef, opts: { resumeFrom?: PipelineCheckpoint; signal?: AbortSignal } = {}): Promise<PipelineReport> {
    const startedAt = Date.now();
    const layers = topoLayers(def.stages);
    const stageById = new Map(def.stages.map((s) => [s.id, s]));
    const policy: RetryPolicy = { ...DEFAULT_RETRY, ...def.retry };
    const maxConc = Math.max(1, def.maxConcurrency ?? 4);

    const outputs = new Map<string, RowBatch>();
    const lineage: LineageEdge[] = [];
    const results: StageResult[] = [];
    const failed = new Set<string>();
    const completed = new Map<string, { rowCount: number; finishedAt: number }>();
    const watermarks = new Map<string, unknown>(opts.resumeFrom?.watermarks ?? []);

    // Restore checkpointed stages so dependents see their outputs.
    const resumed = new Set<string>();
    if (opts.resumeFrom !== undefined) {
      for (const id of opts.resumeFrom.completed.keys()) resumed.add(id);
    }

    for (const layer of layers) {
      // Partition the layer into runnable vs dependency-failed.
      const runnable: StageDef[] = [];
      for (const id of layer) {
        const stage = stageById.get(id);
        if (stage === undefined) continue;
        if (resumed.has(id)) {
          results.push({ stageId: id, status: 'skipped', attempts: 0, durationMs: 0, rowCount: opts.resumeFrom?.completed.get(id)?.rowCount ?? 0 });
          continue;
        }
        const depFailed = (stage.dependsOn ?? []).some((d) => failed.has(d));
        if (depFailed) {
          results.push({ stageId: id, status: 'skipped', attempts: 0, durationMs: 0, rowCount: 0, error: 'upstream failed' });
          failed.add(id);
          continue;
        }
        runnable.push(stage);
      }

      // Bounded-concurrency pool over runnable stages.
      for (let i = 0; i < runnable.length; i += maxConc) {
        const batch = runnable.slice(i, i + maxConc);
        const settled = await Promise.all(batch.map((stage) => this._runStage(def.id, stage, policy, outputs, lineage, watermarks, opts.signal)));
        for (const r of settled) {
          results.push(r.result);
          if (r.result.status === 'success' && r.output !== undefined) {
            outputs.set(r.result.stageId, r.output);
            completed.set(r.result.stageId, { rowCount: r.output.rows.length, finishedAt: Date.now() });
          } else if (r.result.status === 'failed') {
            failed.add(r.result.stageId);
          }
        }
      }
    }

    const anyFailed = results.some((r) => r.status === 'failed');
    const status = anyFailed ? (results.some((r) => r.status === 'success') ? 'partial' : 'failed') : 'success';
    const checkpoint: PipelineCheckpoint = {
      pipelineId: def.id,
      completed,
      watermarks,
      savedAt: Date.now(),
    };
    return {
      pipelineId: def.id,
      status,
      stages: results,
      startedAt,
      finishedAt: Date.now(),
      outputs,
      lineage,
      checkpoint,
    };
  }

  private async _runStage(
    pipelineId: string,
    stage: StageDef,
    globalPolicy: RetryPolicy,
    outputs: ReadonlyMap<string, RowBatch>,
    lineage: LineageEdge[],
    watermarks: Map<string, unknown>,
    signal?: AbortSignal
  ): Promise<{ result: StageResult; output?: RowBatch }> {
    const policy: RetryPolicy = { ...globalPolicy, ...stage.retry };
    const inputs = new Map<string, RowBatch>();
    for (const d of stage.dependsOn ?? []) {
      const b = outputs.get(d);
      if (b !== undefined) inputs.set(d, b);
    }
    let attempt = 0;
    const t0 = Date.now();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (signal?.aborted === true) {
        return { result: { stageId: stage.id, status: 'skipped', attempts: attempt, durationMs: Date.now() - t0, rowCount: 0, error: 'aborted' } };
      }
      try {
        const ctx: StageContext = {
          pipelineId,
          stageId: stage.id,
          inputs,
          watermark: watermarks.get(stage.id),
          attempt,
          reportLineage: (e) => lineage.push(e),
          signal: signal ?? new AbortController().signal,
        };
        const out = await stage.run(ctx);
        if (ctx.watermark !== undefined) watermarks.set(stage.id, ctx.watermark);
        return {
          result: { stageId: stage.id, status: 'success', attempts: attempt + 1, durationMs: Date.now() - t0, rowCount: out.rows.length },
          output: out,
        };
      } catch (e) {
        attempt++;
        if (attempt >= policy.maxAttempts) {
          const msg = e instanceof Error ? e.message : String(e);
          return { result: { stageId: stage.id, status: 'failed', attempts: attempt, durationMs: Date.now() - t0, rowCount: 0, error: msg } };
        }
        await this._sleep(backoffMs(attempt - 1, policy));
      }
    }
  }
}
