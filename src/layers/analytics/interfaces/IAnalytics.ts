/**
 * Analytics Interface
 *
 * Defines the contract for the Analytics and event tracking layer.
 */

import { AnalyticsResult, AnalyticsContext } from '../types/analytics-types';

export interface IAnalytics {
  /**
   * Execute the analytics operation
   */
  execute(context: AnalyticsContext): Promise<AnalyticsResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
