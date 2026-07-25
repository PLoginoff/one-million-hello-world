/**
 * WorkflowEngineCachedStrategy
 *
 * Caching workflowEngine strategy with in-memory cache.
 */

import { WorkflowEngineContext, WorkflowEngineResult } from '../types/workflow-engine-types';

export interface IWorkflowEngineStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: WorkflowEngineContext): Promise<WorkflowEngineResult<unknown>>;
  canHandle(context: WorkflowEngineContext): boolean;
}

export class WorkflowEngineCachedStrategy implements IWorkflowEngineStrategy {
  readonly name = 'cached';
  readonly priority = 7;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: WorkflowEngineContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: WorkflowEngineContext): Promise<WorkflowEngineResult<unknown>> {
    this._executionCount++;
    await Promise.resolve();
    return {
      success: true,
      data: {
        strategy: this.name,
        input: context.input,
        metadata: context.metadata,
        executionCount: this._executionCount,
      },
    };
  }

  configure(config: Record<string, unknown>): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): Record<string, unknown> {
    return { ...this._config };
  }

  getExecutionCount(): number {
    return this._executionCount;
  }
}
