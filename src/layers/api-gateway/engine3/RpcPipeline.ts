/**
 * Deadline-Aware RPC Pipeline
 *
 * Composes gateway middleware into an ordered invocation pipeline —
 * the shape an actual gateway dispatches a request through:
 *
 *     request → [auth] → [quota] → [dedup] → [route] → upstream
 *
 * Each stage is an `RpcStage` that receives the request plus a `next`
 * continuation. Stages may short-circuit (return a response without
 * calling `next()` — e.g. an auth rejection or an idempotency hit),
 * transform the request, or transform the response on the way back.
 *
 * Deadline budgeting: the pipeline tracks an absolute deadline. Before
 * each stage runs, the remaining budget is checked — a pipeline that
 * arrives already expired short-circuits with `deadline-exceeded`.
 * Stages receive the remaining budget so downstream calls can
 * propagate it (mirroring gRPC metadata propagation).
 *
 * Composition is explicit `use()` ordering — execution is a
 * right-nested fold, so the first registered stage is outermost.
 * Onion semantics: stage N wraps stages N+1..M both inbound and
 * outbound.
 *
 * Complexity: use() O(1); execute() O(S) stage invocations.
 *
 * @module ApiGatewayLayer/Engine3
 */

import { GatewayClock3, SystemGatewayClock3 } from './types3';
import { IdempotencyStore, requestFingerprint } from './IdempotencyStore';

/** A request flowing through the pipeline. */
export interface RpcRequest {
  /** Route or method path. */
  readonly path: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
  /** Absolute deadline in epoch ms; pipeline enforces it per stage. */
  readonly deadlineMs?: number;
  /** Free-form bag stages can annotate (trace ids, resolved routes...). */
  readonly attributes: Readonly<Record<string, unknown>>;
}

export interface RpcResult {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  /** Set when the pipeline itself produced the response. */
  readonly shortcut?: 'deadline-exceeded' | 'stage-short-circuit';
}

/** Per-stage execution context. */
export interface RpcContext {
  /** ms left on the request deadline (undefined = no deadline). */
  readonly deadlineRemainingMs?: number;
  /** Zero-based index of the stage currently running. */
  readonly stageIndex: number;
  /** Request attributes — stages may add entries to a mutable copy. */
  readonly attributes: Record<string, unknown>;
  /**
   * Abort the whole pipeline with this response. Equivalent to
   * returning without calling next(), but usable from nested helpers.
   */
  abort(response: RpcResult): never;
}

/**
 * A pipeline stage. Call `next(modifiedRequest?)` to proceed inward;
 * return an `RpcResult` directly to short-circuit. Whatever the stage
 * returns propagates outward untouched — transform by post-processing
 * `next()`'s result.
 */
export type RpcStage = (
  req: RpcRequest,
  ctx: RpcContext,
  next: (req?: RpcRequest) => Promise<RpcResult>
) => Promise<RpcResult> | RpcResult;

/** Thrown by `ctx.abort()`; caught by the pipeline runner. */
class PipelineAbort extends Error {
  constructor(readonly response: RpcResult) {
    super('pipeline aborted');
    this.name = 'PipelineAbort';
  }
}

export interface PipelineOptions {
  readonly clock?: GatewayClock3;
  /** Stage name tags for tracing/debugging (parallel array). */
  readonly stageNames?: readonly string[];
}

export interface PipelineTrace {
  /** Per-stage duration in ms, in registration order. */
  readonly stages: ReadonlyArray<{ index: number; name?: string; durationMs: number }>;
  /** Index of the stage that produced the response (-1 = terminal). */
  readonly resolvedAt: number;
}

export class RpcPipeline {
  private readonly stages: { stage: RpcStage; name?: string }[] = [];
  private readonly clock: GatewayClock3;
  private lastTrace: PipelineTrace | undefined;

  constructor(options: PipelineOptions = {}) {
    this.clock = options.clock ?? new SystemGatewayClock3();
    // Stage names attach at use() time, so pre-seeded names are
    // held and consumed in registration order.
    this.pendingNames = [...(options.stageNames ?? [])];
  }

  private readonly pendingNames: string[];

  /** Append a stage. Registration order = execution order. */
  use(stage: RpcStage, name?: string): this {
    const resolved = name ?? this.pendingNames.shift();
    this.stages.push({ stage, name: resolved });
    return this;
  }

  /** Number of registered stages. */
  get size(): number {
    return this.stages.length;
  }

  /** Trace of the most recent execute() call. */
  trace(): PipelineTrace | undefined {
    return this.lastTrace;
  }

  /**
   * Run `request` through all stages to `terminal` (the upstream
   * call) and back. `terminal` defaults to a 404 when omitted.
   */
  async execute(
    request: RpcRequest,
    terminal: (req: RpcRequest) => Promise<RpcResult> = async () => ({
      status: 404,
      headers: {},
      body: '{"error":"no upstream"}',
    })
  ): Promise<RpcResult> {
    const trace: { index: number; name?: string; durationMs: number }[] = [];
    let resolvedAt = -1;

    const ctx = (
      index: number,
      req: RpcRequest,
      attributes: Record<string, unknown>
    ): RpcContext => {
      const remaining =
        req.deadlineMs !== undefined
          ? Math.max(0, req.deadlineMs - this.clock.now())
          : undefined;
      return {
        deadlineRemainingMs: remaining,
        stageIndex: index,
        attributes,
        abort(response: RpcResult): never {
          throw new PipelineAbort(response);
        },
      };
    };

    const run = async (index: number, req: RpcRequest): Promise<RpcResult> => {
      // Deadline gate: a stage entering with no budget left loses.
      if (req.deadlineMs !== undefined && this.clock.now() >= req.deadlineMs) {
        resolvedAt = index;
        return {
          status: 504,
          headers: {},
          body: '{"error":"gateway deadline exceeded"}',
          shortcut: 'deadline-exceeded',
        };
      }
      if (index >= this.stages.length) {
        resolvedAt = index;
        return terminal(req);
      }
      const { stage, name } = this.stages[index]!;
      const t0 = this.clock.now();
      const attributes = { ...req.attributes };
      const req2 = { ...req, attributes };
      try {
        return await stage(req2, ctx(index, req2, attributes), (nextReq?: RpcRequest) =>
          run(index + 1, nextReq ?? req2)
        );
      } catch (e) {
        if (e instanceof PipelineAbort) {
          resolvedAt = index;
          return { ...e.response, shortcut: 'stage-short-circuit' };
        }
        throw e;
      } finally {
        trace.push({ index, name, durationMs: this.clock.now() - t0 });
      }
    };

    const result = await run(0, request);
    this.lastTrace = { stages: trace.sort((a, b) => a.index - b.index), resolvedAt };
    return result;
  }
}

/* ------------------------------------------------------------------ */
/* Stock middleware                                                    */
/* ------------------------------------------------------------------ */

/**
 * Header-injection stage: copies fixed headers onto the request
 * (e.g. `x-gateway-id`, `x-forwarded-for`).
 */
export function headerInjectionStage(headers: Record<string, string>): RpcStage {
  return (req, _ctx, next) =>
    next({ ...req, headers: { ...headers, ...req.headers } });
}

/**
 * Deadline-propagation stage: reads `x-deadline-ms` from headers into
 * `request.deadlineMs` so the pipeline's budget gate engages.
 */
export function deadlinePropagationStage(): RpcStage {
  return (req, _ctx, next) => {
    const header = req.headers['x-deadline-ms'];
    if (header === undefined) return next(req);
    const deadline = Number(header);
    if (!Number.isFinite(deadline)) {
      return {
        status: 400,
        headers: {},
        body: '{"error":"malformed x-deadline-ms header"}',
      };
    }
    return next({ ...req, deadlineMs: deadline });
  };
}

/**
 * Idempotency-key stage backed by `IdempotencyStore`: deduplicates
 * mutating methods (POST/PATCH/PUT/DELETE) carrying a key; replays
 * stored responses on hit and waits on in-flight duplicates.
 */
export function idempotencyStage(store: IdempotencyStore): RpcStage {
  const IDEMPOTENT_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
  return async (req, _ctx, next) => {
    const key = req.headers['idempotency-key'];
    if (key === undefined || !IDEMPOTENT_METHODS.has(req.method.toUpperCase())) {
      return next(req);
    }
    const fp = requestFingerprint(req.method, req.path, req.body);
    const outcome = store.check(key, fp);
    switch (outcome.kind) {
      case 'hit':
        return {
          status: outcome.response.status,
          headers: { ...outcome.response.headers, 'x-idempotent-replay': 'true' },
          body: outcome.response.body,
        };
      case 'conflict':
        return {
          status: 422,
          headers: {},
          body: '{"error":"idempotency key reused with different request"}',
        };
      case 'in-flight': {
        const stored = await store.wait(key);
        if (stored) {
          return {
            status: stored.status,
            headers: { ...stored.headers, 'x-idempotent-replay': 'true' },
            body: stored.body,
          };
        }
        return next(req); // raced a release — retry inline
      }
      case 'miss': {
        const res = await next(req);
        // Only replayable statuses are worth caching.
        if (res.status < 500) {
          store.store(key, {
            status: res.status,
            headers: { ...res.headers },
            body: res.body,
          });
        } else {
          store.release(key); // don't pin the key on upstream failure
        }
        return res;
      }
    }
  };
}
