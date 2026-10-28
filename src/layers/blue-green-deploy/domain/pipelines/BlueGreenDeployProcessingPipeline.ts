/**
 * BlueGreenDeployProcessingPipeline
 */

export interface BlueGreenDeployPipelineContext {
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

export interface BlueGreenDeployPipelineStage {
  name: string;
  process: (ctx: BlueGreenDeployPipelineContext) => Promise<void>;
  handleError?: (ctx: BlueGreenDeployPipelineContext, error: Error) => Promise<boolean>;
}

export class BlueGreenDeployProcessingPipeline {
  private _stages: BlueGreenDeployPipelineStage[];
  private _beforeHooks: Array<(ctx: BlueGreenDeployPipelineContext) => void>;
  private _afterHooks: Array<(ctx: BlueGreenDeployPipelineContext) => void>;
  private _executions: BlueGreenDeployPipelineContext[];

  constructor() {
    this._stages = [];
    this._beforeHooks = [];
    this._afterHooks = [];
    this._executions = [];
  }

  addStage(
    name: string,
    process: (ctx: BlueGreenDeployPipelineContext) => Promise<void>,
    handleError?: (ctx: BlueGreenDeployPipelineContext, error: Error) => Promise<boolean>
  ): this {
    this._stages.push({ name, process, handleError });
    return this;
  }

  beforeExecute(hook: (ctx: BlueGreenDeployPipelineContext) => void): this {
    this._beforeHooks.push(hook);
    return this;
  }

  afterExecute(hook: (ctx: BlueGreenDeployPipelineContext) => void): this {
    this._afterHooks.push(hook);
    return this;
  }

  async execute(input: unknown, metadata: Record<string, unknown> = {}): Promise<BlueGreenDeployPipelineContext> {
    const ctx: BlueGreenDeployPipelineContext = {
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
  getExecutions(): BlueGreenDeployPipelineContext[] {
    return [...this._executions];
  }
  getExecutionCount(): number {
    return this._executions.length;
  }
  clearExecutions(): void {
    this._executions = [];
  }
}
