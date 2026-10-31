/**
 * Controller Pipeline — staged response transformation after handling.
 *
 * A controller produces a raw value; the pipeline then walks ordered
 * stages — enrichment (add links/meta), shaping (DTO projection),
 * error mapping, and response finalization — each a pure function or
 * async transform. Stages see a `PipelineFrame` carrying the value,
 * the request context, and accumulated metadata; they may replace the
 * value, annotate it, or abort with a `PipelineError`.
 *
 * Unlike the router-level middleware onion (which wraps *dispatch*),
 * this is a *post-handler* transform chain — the same pattern as ASP.NET
 * result filters or JAX-RS `ContainerResponseFilter`s.
 *
 * Error mapping: any throw inside a stage short-circuits into
 * `onError` stages instead of propagating — the controller can map
 * domain errors to problem details without leaking internals.
 *
 * @module ControllerLayer/Engine
 */

import { ControllerRequestContext } from './streaming-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A value moving through the pipeline + its annotations. */
export interface PipelineFrame {
  /** Current payload — stages replace this. */
  value: unknown;
  /** Request-scoped context (correlation, DI). */
  readonly ctx: ControllerRequestContext;
  /** Accumulated metadata — headers, links, status overrides. */
  readonly meta: {
    status?: number;
    headers: Record<string, string>;
    annotations: Record<string, unknown>;
  };
  /** Whether a stage has aborted the chain. */
  aborted: boolean;
}

/** One transform stage. */
export interface PipelineStage {
  readonly name: string;
  transform(frame: PipelineFrame): Promise<void> | void;
}

/** Error-mapping stage — runs when a transform throws. */
export interface ErrorStage {
  readonly name: string;
  handle(frame: PipelineFrame, error: unknown): Promise<boolean> | boolean;
}

/** Options for {@link ControllerPipeline}. */
export interface ControllerPipelineOptions {
  /** Ordered transform stages. */
  readonly stages?: readonly PipelineStage[];
  /** Ordered error stages — first `true` return wins. */
  readonly errorStages?: readonly ErrorStage[];
}

/** The finalized pipeline output. */
export interface PipelineResult {
  readonly value: unknown;
  readonly status: number;
  readonly headers: Record<string, string>;
  /** Stages that ran, in order — diagnostics. */
  readonly stageTrace: readonly string[];
  /** Whether the pipeline aborted early. */
  readonly aborted: boolean;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/** Raised by a stage to abort with a status + body. */
export class PipelineAbort extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown) {
    super(`Pipeline aborted with status ${status}`);
    this.name = 'PipelineAbort';
    this.status = status;
    this.body = body;
  }
}

/**
 * Post-handler transform chain.
 *
 * Registration order is execution order; each stage can:
 *   - mutate `frame.value` (transform),
 *   - set `frame.meta.status` / `frame.meta.headers`,
 *   - `frame.aborted = true` to halt remaining stages, or
 *   - throw `PipelineAbort` for an immediate structured result.
 */
export class ControllerPipeline {
  private readonly _stages: PipelineStage[];
  private readonly _errorStages: ErrorStage[];

  constructor(options?: ControllerPipelineOptions) {
    this._stages = [...(options?.stages ?? [])];
    this._errorStages = [...(options?.errorStages ?? [])];
  }

  /** Append a transform stage. */
  stage(name: string, transform: PipelineStage['transform']): this {
    this._stages.push({ name, transform });
    return this;
  }

  /** Append an error-mapping stage (function or a prebuilt stage). */
  onError(nameOrStage: string | ErrorStage, handle?: ErrorStage['handle']): this {
    if (typeof nameOrStage === 'string') {
      if (handle === undefined) {
        throw new Error('ControllerPipeline.onError: handle required with a name');
      }
      this._errorStages.push({ name: nameOrStage, handle });
      return this;
    }
    this._errorStages.push(nameOrStage);
    return this;
  }

  /** Number of transform stages. */
  get stageCount(): number {
    return this._stages.length;
  }

  /**
   * Run the pipeline over `value`.
   * Errors bubble through `errorStages`; unhandled errors rethrow.
   */
  async run(value: unknown, ctx: ControllerRequestContext): Promise<PipelineResult> {
    const frame: PipelineFrame = {
      value,
      ctx,
      meta: { headers: {}, annotations: {} },
      aborted: false,
    };
    const trace: string[] = [];

    for (const stage of this._stages) {
      if (frame.aborted) {
        break;
      }
      try {
        await stage.transform(frame);
        trace.push(stage.name);
      } catch (err) {
        if (err instanceof PipelineAbort) {
          return {
            value: err.body,
            status: err.status,
            headers: frame.meta.headers,
            stageTrace: trace,
            aborted: true,
          };
        }
        const handled = await this.tryHandleError(frame, err);
        if (!handled) {
          throw err;
        }
        trace.push(`${stage.name}!`);
        // An error stage that handles the error may set a value/status
        // and abort the remaining chain.
        break;
      }
    }

    return {
      value: frame.value,
      status: frame.meta.status ?? 200,
      headers: frame.meta.headers,
      stageTrace: trace,
      aborted: frame.aborted,
    };
  }

  /**
   * Offer the error to each error stage in order — first `true` wins.
   * Stages can mutate `frame.value`/`frame.meta.status` to produce a
   * structured error response.
   */
  private async tryHandleError(frame: PipelineFrame, error: unknown): Promise<boolean> {
    for (const stage of this._errorStages) {
      const handled = await stage.handle(frame, error);
      if (handled) {
        if (frame.meta.status === undefined) {
          frame.meta.status = 500;
        }
        return true;
      }
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// Canned stages
// ---------------------------------------------------------------------------

/** Adds a `Link` header per registered rel. */
export function linkHeaderStage(): PipelineStage {
  return {
    name: 'link-headers',
    transform: (frame) => {
      const links = frame.meta.annotations['links'];
      if (Array.isArray(links)) {
        const existing = frame.meta.headers['link'];
        const rendered = (links as Array<{ rel: string; href: string }>)
          .map((l) => `<${l.href}>; rel="${l.rel}"`)
          .join(', ');
        frame.meta.headers['link'] = existing === undefined ? rendered : `${existing}, ${rendered}`;
      }
    },
  };
}

/** Wraps the value in a standard envelope `{ data, meta }`. */
export function envelopeStage(): PipelineStage {
  return {
    name: 'envelope',
    transform: (frame) => {
      frame.value = { data: frame.value, meta: { ...frame.meta.annotations } };
    },
  };
}

/** Maps an error class to a status + problem-shaped body. */
export function problemMappingStage(
  predicate: (err: unknown) => number | null
): ErrorStage {
  return {
    name: 'problem-mapping',
    handle: (frame, error) => {
      const status = predicate(error);
      if (status === null) {
        return false;
      }
      frame.meta.status = status;
      frame.value = {
        type: 'about:blank',
        title: error instanceof Error ? error.name : 'Error',
        status,
        detail: error instanceof Error ? error.message : String(error),
      };
      return true;
    },
  };
}
