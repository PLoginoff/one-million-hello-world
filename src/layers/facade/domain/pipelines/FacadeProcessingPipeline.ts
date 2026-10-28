/**
 * FacadeProcessingPipeline
 */

export interface FacadePipelineContext {
  id: string;
  input: unknown;
  metadata: Record<string, unknown>;
  stages: string[];
  currentStage: number;
  output?: unknown;
  error?: string;
  startTime: number;
  endTime?: number;
}

export interface FacadePipelineStage {
  name: string;
  process: (ctx: FacadePipelineContext) => Promise<void>;
  handleError?: (ctx: FacadePipelineContext, error: Error) => Promise<boolean>;
}

export class FacadeProcessingPipeline {
  private _stages: FacadePipelineStage[];
  private _beforeHooks: Array<(ctx: FacadePipelineContext) => void>;
  private _afterHooks: Array<(ctx: FacadePipelineContext) => void>;
  private _executions: FacadePipelineContext[];

  constructor() {
    this._stages = [];
    this._beforeHooks = [];
    this._afterHooks = [];
    this._executions = [];
  }

  addStage(
    name: string,
    process: (ctx: FacadePipelineContext) => Promise<void>,
    handleError?: (ctx: FacadePipelineContext, error: Error) => Promise<boolean>
  ): this {
    this._stages.push({ name, process, handleError });
    return this;
  }

  beforeExecute(hook: (ctx: FacadePipelineContext) => void): this {
    this._beforeHooks.push(hook);
    return this;
  }

  afterExecute(hook: (ctx: FacadePipelineContext) => void): this {
    this._afterHooks.push(hook);
    return this;
  }

  async execute(input: unknown, metadata: Record<string, unknown> = {}): Promise<FacadePipelineContext> {
    const ctx: FacadePipelineContext = {
      id: 'pipeline-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      input: input,
      metadata: metadata,
      stages: this._stages.map((s) => s.name),
      currentStage: 0,
      startTime: Date.now(),
    };

    this._beforeHooks.forEach((h) => h(ctx));

    for (let i = 0; i < this._stages.length; i++) {
      ctx.currentStage = i;
      const stage = this._stages[i];
      try {
        await stage.process(ctx);
      } catch (e) {
        ctx.error = (e as Error).message;
        if (stage.handleError) {
          const shouldContinue = await stage.handleError(ctx, e as Error);
          if (!shouldContinue) {
            ctx.endTime = Date.now();
            this._afterHooks.forEach((h) => h(ctx));
            this._executions.push(ctx);
            return ctx;
          }
          ctx.error = undefined;
        } else {
          ctx.endTime = Date.now();
          this._afterHooks.forEach((h) => h(ctx));
          this._executions.push(ctx);
          return ctx;
        }
      }
    }

    ctx.endTime = Date.now();
    this._afterHooks.forEach((h) => h(ctx));
    this._executions.push(ctx);
    return ctx;
  }

  getStages(): string[] {
    return this._stages.map((s) => s.name);
  }
  getExecutions(): FacadePipelineContext[] {
    return [...this._executions];
  }
  getExecutionCount(): number {
    return this._executions.length;
  }
  clearExecutions(): void {
    this._executions = [];
  }
}
