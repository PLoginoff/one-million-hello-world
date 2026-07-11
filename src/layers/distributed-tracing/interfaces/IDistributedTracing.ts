/**
 * DistributedTracing Interface
 *
 * Defines the contract for the Distributed tracing with OpenTelemetry layer.
 */

import { DistributedTracingResult, DistributedTracingContext } from '../types/distributed-tracing-types';

export interface IDistributedTracing {
  /**
   * Execute the distributedTracing operation
   */
  execute(context: DistributedTracingContext): Promise<DistributedTracingResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
