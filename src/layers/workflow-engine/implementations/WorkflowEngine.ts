/**
 * WorkflowEngine Implementation
 *
 * Concrete implementation of IWorkflowEngine.
 * Handles Workflow engine and state machines.
 */

import { IWorkflowEngine } from '../interfaces/IWorkflowEngine';
import { WorkflowEngineResult, WorkflowEngineContext } from '../types/workflow-engine-types';

export class WorkflowEngine implements IWorkflowEngine {
  private _config: Record<string, unknown>;
  private _metrics: Map<string, number>;

  constructor() {
    this._config = {};
    this._metrics = new Map();
  }

  async execute(context: WorkflowEngineContext): Promise<WorkflowEngineResult<unknown>> {
    const startTime = Date.now();
    try {
      const output = this._process(context);
      this._recordMetric('successCount', 1);
      this._recordMetric('lastExecutionTime', Date.now() - startTime);
      return Promise.resolve({ success: true, data: output });
    } catch (error) {
      this._recordMetric('failureCount', 1);
      return Promise.resolve({
        success: false,
        error: {
          code: 'WORKFLOWENGINE_EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  }

  configure(config: Record<string, unknown>): void {
    this._config = { ...this._config, ...config };
  }

  getStatus(): Record<string, unknown> {
    return {
      config: this._config,
      metrics: Object.fromEntries(this._metrics),
      active: true,
    };
  }

  private _process(context: WorkflowEngineContext): unknown {
    return { processed: true, context, layer: 'WorkflowEngine' };
  }

  private _recordMetric(name: string, delta: number): void {
    const current = this._metrics.get(name) ?? 0;
    this._metrics.set(name, current + delta);
  }
}
