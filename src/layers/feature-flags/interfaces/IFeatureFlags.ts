/**
 * FeatureFlags Interface
 *
 * Defines the contract for the Feature flags and dynamic toggles layer.
 */

import { FeatureFlagsResult, FeatureFlagsContext } from '../types/feature-flags-types';

export interface IFeatureFlags {
  /**
   * Execute the featureFlags operation
   */
  execute(context: FeatureFlagsContext): Promise<FeatureFlagsResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
