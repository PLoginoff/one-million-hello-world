/**
 * Observability Interface
 *
 * Defines the contract for the Metrics, logs and traces aggregation layer.
 */

import { ObservabilityResult, ObservabilityContext } from '../types/observability-types';

export interface IObservability {
  /**
   * Execute the observability operation
   */
  execute(context: ObservabilityContext): Promise<ObservabilityResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
