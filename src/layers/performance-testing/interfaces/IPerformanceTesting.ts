/**
 * PerformanceTesting Interface
 *
 * Defines the contract for the Performance and load testing layer.
 */

import { PerformanceTestingResult, PerformanceTestingContext } from '../types/performance-testing-types';

export interface IPerformanceTesting {
  /**
   * Execute the performanceTesting operation
   */
  execute(context: PerformanceTestingContext): Promise<PerformanceTestingResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
