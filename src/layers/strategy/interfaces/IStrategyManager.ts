/**
 * Strategy Manager Interface
 * 
 * Defines the contract for strategy operations
 * including execution strategies, A/B testing, and feature flags.
 */

import {
  StrategyType,
  FeatureFlag,
  StrategyResult,
  StrategyConfig,
} from '../types/strategy-types';

/**
 * Interface for strategy operations
 */
export interface IStrategyManager {
  /**
   * Executes operation with selected strategy
   * 
   * @param operation - Operation to execute
   * @param strategy - Strategy type
   * @returns Strategy result
   */
  execute<T>(operation: () => T | Promise<T>, strategy?: StrategyType): Promise<StrategyResult<T>>;

  /**
   * Registers a feature flag
   * 
   * @param flag - Feature flag
   */
  registerFlag(flag: FeatureFlag): void;

  /**
   * Checks if a feature flag is enabled
   * 
   * @param flagName - Feature flag name
   * @returns True if enabled
   */
  isFlagEnabled(flagName: string): boolean;

  /**
   * Sets strategy configuration
   * 
   * @param config - Strategy configuration
   */
  setConfig(config: StrategyConfig): void;

  /**
   * Gets current strategy configuration
   * 
   * @returns Current strategy configuration
   */
  getConfig(): StrategyConfig;
}
