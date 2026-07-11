/**
 * WorkflowEngine Interface
 *
 * Defines the contract for the Workflow engine and state machines layer.
 */

import { WorkflowEngineResult, WorkflowEngineContext } from '../types/workflow-engine-types';

export interface IWorkflowEngine {
  /**
   * Execute the workflowEngine operation
   */
  execute(context: WorkflowEngineContext): Promise<WorkflowEngineResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
