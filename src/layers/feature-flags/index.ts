/**
 * FeatureFlags Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the FeatureFlags Layer (Layer 29 of the architecture).
 */

export { IFeatureFlags } from './interfaces/IFeatureFlags';
export { FeatureFlags } from './implementations/FeatureFlags';
export {
  FlagEvaluator,
  InMemoryFlagStore,
  CountingAnalytics,
  boolFlag,
  multivariateFlag,
} from './implementations/FlagEvaluator';
export type {
  FlagStore,
  EvaluationAnalytics,
  FlagEvaluatorOptions,
} from './implementations/FlagEvaluator';
export * from './types/feature-flags-types';
export * from './domain';
export * from './configuration';
export * from './strategies';
export * from './factories';
