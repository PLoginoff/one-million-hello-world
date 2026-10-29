/**
 * Process builder strategy — a fluent DSL for constructing
 * {@link WorkflowDefinition}s plus a sequential-execution fast path.
 *
 * Two contributions:
 *
 *  1. {@link ProcessBuilder} — chainable builder producing validated
 *     definitions: `.task('a', h).xor('g').when(...).otherwise(...)` etc.
 *     The builder manages edge bookkeeping so authors can't wire invalid
 *     graphs (dangling edges, missing joins).
 *
 *  2. {@link SequentialProcessStrategy} — executes a *linear* process (a
 *     list of steps with optional retries/compensations) without the full
 *     token interpreter. Useful for the large class of workflows that are
 *     really just ordered step lists; produces the same task-record shape
 *     as the runtime so reporting is uniform.
 *
 * @module WorkflowEngine/Strategies
 */

import {
  CompensationHandler,
  EdgeCondition,
  FlowEdge,
  FlowNode,
  RetryPolicy,
  TaskContext,
  TaskHandler,
  TaskRecord,
  WorkflowDefinition,
  WorkflowVariables,
  validateDefinition,
} from '../domain/workflow-model';

/* ------------------------------------------------------------------ */
/* Fluent builder                                                      */
/* ------------------------------------------------------------------ */

/**
 * Usage:
 * ```ts
 * const def = new ProcessBuilder('order-fulfilment', 'v1')
 *   .task('charge', chargeHandler, { retry: { maxAttempts: 3, backoffMs: 100 }, compensation: refund })
 *   .xor('route')
 *     .when((v) => v.total > 1000, 'manual-review')
 *     .otherwise('ship')
 *   .task('manual-review', review).edgeTo('ship')     // join the branches
 *   .task('ship', shipHandler)
 *   .build();
 * ```
 *
 * Nodes are appended implicitly — the builder keeps a cursor; `xor`/`and`
 * open a branching region, `when`/`otherwise` register outgoing edges from
 * the current gateway, and named tasks referenced in branches are created
 * lazily as forward references resolved at `build()` time.
 */
export class ProcessBuilder {
  private readonly _nodes: FlowNode[] = [];
  private readonly _edges: FlowEdge[] = [];
  private _cursor: string;
  private readonly _lazyTasks = new Map<string, TaskHandler>();
  private _xorCounter = 0;
  private _andCounter = 0;

  constructor(
    private readonly _id: string,
    private readonly _version = 'v1'
  ) {
    const startId = 'start';
    this._nodes.push({ kind: 'start', id: startId });
    this._cursor = startId;
  }

  /** Appends a task and moves the cursor to it. */
  task(
    id: string,
    handler: TaskHandler,
    opts: {
      retry?: RetryPolicy;
      compensation?: CompensationHandler;
      deadline?: { afterMs: number; action: 'fail' | 'escalate' | 'skip'; escalateTo?: TaskHandler };
      loopWhile?: EdgeCondition;
      output?: (output: unknown, vars: WorkflowVariables) => WorkflowVariables;
    } = {}
  ): this {
    this._nodes.push({
      kind: 'task',
      id,
      handler,
      retry: opts.retry,
      compensation: opts.compensation,
      deadline: opts.deadline,
      loopWhile: opts.loopWhile,
      output: opts.output,
    });
    this._edges.push({ from: this._cursor, to: id });
    this._cursor = id;
    return this;
  }

  /** Opens an exclusive gateway; cursor moves to it. */
  xor(id?: string): this {
    const gid = id ?? `xor-${++this._xorCounter}`;
    this._nodes.push({ kind: 'xor', id: gid });
    this._edges.push({ from: this._cursor, to: gid });
    this._cursor = gid;
    return this;
  }

  /**
   * Registers a conditioned branch out of the current XOR gateway to
   * `targetId`. The target task may be declared lazily via
   * `.when(cond, 'name', handler)` — or reference a later `.task('name')`.
   */
  when(condition: EdgeCondition, targetId: string, handler?: TaskHandler): this {
    this._edges.push({ from: this._cursor, to: targetId, condition });
    if (handler) {
      this._lazyTasks.set(targetId, handler);
    }
    return this;
  }

  /** Registers the default branch of the current XOR gateway. */
  otherwise(targetId: string, handler?: TaskHandler): this {
    this._edges.push({ from: this._cursor, to: targetId, isDefault: true });
    if (handler) {
      this._lazyTasks.set(targetId, handler);
    }
    return this;
  }

  /** Opens a parallel fork; all `branch` targets execute concurrently. */
  parallel(id?: string): this {
    const gid = id ?? `and-${++this._andCounter}`;
    this._nodes.push({ kind: 'and', id: gid });
    this._edges.push({ from: this._cursor, to: gid });
    this._cursor = gid;
    return this;
  }

  /** Registers a branch out of a fork, or (on a join) merges into target. */
  branch(targetId: string, handler?: TaskHandler): this {
    this._edges.push({ from: this._cursor, to: targetId });
    if (handler) {
      this._lazyTasks.set(targetId, handler);
    }
    return this;
  }

  /** Join gateway — merge point for parallel branches. */
  join(id?: string): this {
    const gid = id ?? `and-join-${++this._andCounter}`;
    this._nodes.push({ kind: 'and', id: gid });
    return this._moveCursorTo(gid);
  }

  /** Adds an edge from a named node to the current cursor — for merging branches. */
  edgeFrom(fromId: string): this {
    this._edges.push({ from: fromId, to: this._cursor });
    return this;
  }

  /** Adds an edge from the cursor to a named node. */
  edgeTo(toId: string): this {
    this._edges.push({ from: this._cursor, to: toId });
    return this;
  }

  /** Appends a subflow node. */
  subflow(
    id: string,
    workflowId: string,
    opts: {
      version?: string;
      input?: (v: WorkflowVariables) => WorkflowVariables;
      output?: (o: unknown, v: WorkflowVariables) => WorkflowVariables;
    } = {}
  ): this {
    this._nodes.push({ kind: 'subflow', id, workflowId, ...opts });
    this._edges.push({ from: this._cursor, to: id });
    this._cursor = id;
    return this;
  }

  /**
   * Closes the definition: lazily-declared tasks are materialized, an end
   * node is appended, and the graph is validated.
   */
  build(endId = 'end'): WorkflowDefinition {
    // Materialize lazy tasks — they get an edge to end unless edges exist.
    for (const [id, handler] of this._lazyTasks) {
      if (!this._nodes.some((n) => n.id === id)) {
        this._nodes.push({ kind: 'task', id, handler });
      }
    }
    this._lazyTasks.clear();

    this._nodes.push({ kind: 'end', id: endId });
    // Any node with no outgoing edge flows to end — standard implicit
    // completion. Except gateways already fully wired and the end itself.
    for (const n of this._nodes) {
      if (n.id === endId || n.kind === 'end') {
        continue;
      }
      const hasOut = this._edges.some((e) => e.from === n.id);
      if (!hasOut) {
        this._edges.push({ from: n.id, to: endId });
      }
    }

    const def: WorkflowDefinition = {
      id: this._id,
      version: this._version,
      nodes: [...this._nodes],
      edges: [...this._edges],
    };
    const problems = validateDefinition(def);
    if (problems.length > 0) {
      throw new Error(`ProcessBuilder produced invalid definition: ${problems.join('; ')}`);
    }
    return def;
  }

  private _moveCursorTo(id: string): this {
    this._cursor = id;
    return this;
  }
}

/* ------------------------------------------------------------------ */
/* Sequential fast-path strategy                                        */
/* ------------------------------------------------------------------ */

export interface SequentialStep {
  readonly id: string;
  readonly handler: TaskHandler;
  readonly retry?: RetryPolicy;
  readonly compensation?: CompensationHandler;
  /** Skip this step when the predicate fails. */
  readonly skipIf?: EdgeCondition;
}

export interface SequentialRunResult {
  readonly completed: boolean;
  readonly history: readonly TaskRecord[];
  readonly variables: WorkflowVariables;
  readonly compensated: readonly string[];
  readonly error?: string;
}

/**
 * Runs a linear step list with retry + saga compensation, producing the
 * same {@link TaskRecord} shape as {@link WorkflowRuntime} — sequential
 * pipelines don't need tokens.
 */
export class SequentialProcessStrategy {
  readonly name = 'sequential-process';
  private readonly _clock: () => number;

  constructor(clock: () => number = Date.now) {
    this._clock = clock;
  }

  async run(steps: readonly SequentialStep[], variables: WorkflowVariables = {}): Promise<SequentialRunResult> {
    const vars: WorkflowVariables = { ...variables };
    const history: TaskRecord[] = [];
    const done: { step: SequentialStep; output: unknown; snap: WorkflowVariables }[] = [];

    for (const step of steps) {
      if (step.skipIf && step.skipIf(vars)) {
        history.push({
          nodeId: step.id,
          startedAt: this._clock(),
          completedAt: this._clock(),
          attempts: 0,
          skipped: true,
        });
        continue;
      }
      const rec: TaskRecord = { nodeId: step.id, startedAt: this._clock(), attempts: 0 };
      const maxAttempts = step.retry?.maxAttempts ?? 1;
      let output: unknown;
      let lastError: unknown;
      let ok = false;

      for (let attempt = 1; attempt <= maxAttempts && !ok; attempt++) {
        rec.attempts = attempt;
        try {
          const ctx: TaskContext = {
            variables: vars,
            input: vars,
            instanceId: 'seq',
            nodeId: step.id,
            attempt,
          };
          output = await step.handler(ctx);
          ok = true;
        } catch (e) {
          lastError = e;
          if (step.retry?.retryableIf && !step.retry.retryableIf(e)) {
            break;
          }
        }
      }

      rec.completedAt = this._clock();
      if (!ok) {
        rec.error = lastError instanceof Error ? lastError.message : String(lastError);
        history.push(rec);
        // Compensate LIFO.
        const compensated: string[] = [];
        for (const d of [...done].reverse()) {
          if (d.step.compensation) {
            try {
              await d.step.compensation(
                { variables: d.snap, input: d.snap, instanceId: 'seq', nodeId: d.step.id, attempt: 1 },
                d.output
              );
            } catch {
              // best-effort — continue unwinding
            }
            compensated.push(d.step.id);
          }
        }
        return {
          completed: false,
          history,
          variables: vars,
          compensated,
          error: rec.error,
        };
      }

      rec.output = output;
      vars[step.id] = output;
      history.push(rec);
      if (step.compensation) {
        done.push({ step, output, snap: { ...vars } });
      }
    }

    return { completed: true, history, variables: vars, compensated: [] };
  }
}
