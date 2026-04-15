/**
 * Strategy Layer Types
 * 
 * This module defines all type definitions for the Strategy Layer,
 * including execution strategies, A/B testing, and feature flags.
 */

/**
 * Strategy type
 */
export enum StrategyType {
  DEFAULT = 'default',
  EXPERIMENTAL = 'experimental',
  CONSERVATIVE = 'conservative',
}

/**
 * Feature flag
 */
export interface FeatureFlag {
  name: string;
  enabled: boolean;
  percentage: number;
}

/**
 * Strategy result
 */
export interface StrategyResult<T> {
  success: boolean;
  data?: T;
  strategy: StrategyType;
  flags: string[];
}

/**
 * Strategy configuration
 */
export interface StrategyConfig {
  defaultStrategy: StrategyType;
  enableABTesting: boolean;
  enableFeatureFlags: boolean;
}
