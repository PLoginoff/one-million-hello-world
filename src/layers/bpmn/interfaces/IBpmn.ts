/**
 * Bpmn Interface
 *
 * Defines the contract for the BPMN process execution layer.
 */

import { BpmnResult, BpmnContext } from '../types/bpmn-types';

export interface IBpmn {
  /**
   * Execute the bpmn operation
   */
  execute(context: BpmnContext): Promise<BpmnResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
