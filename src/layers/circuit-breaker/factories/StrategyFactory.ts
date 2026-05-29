/**
 * Circuit Breaker Strategy Factory
 * 
 * Factory for creating circuit breaker strategy instances.
 */

import { DefaultFallbackStrategy } from '../strategies/fallback/DefaultFallbackStrategy';
import { DefaultValueFallbackStrategy } from '../strategies/fallback/DefaultValueFallbackStrategy';
import { CacheFallbackStrategy } from '../strategies/fallback/CacheFallbackStrategy';
import { DefaultStateTransitionStrategy } from '../strategies/state-transition/StateTransitionStrategy';
import { IStateTransitionStrategy } from '../strategies/state-transition/StateTransitionStrategy';
import { IFallbackStrategy } from '../strategies/fallback/IFallbackStrategy';

export interface StrategyFactoryOptions {
  fallbackType?: 'default' | 'value' | 'cache';
  fallbackValue?: unknown;
  cache?: Map<string, unknown>;
  cacheTtl?: number;
  transitionType?: 'default';
}

export class StrategyFactory {
  /**
   * Create fallback strategy
   */
  static createFallbackStrategy<T>(options?: StrategyFactoryOptions): IFallbackStrategy<T> {
    const fallbackType = options?.fallbackType || 'default';

    switch (fallbackType) {
      case 'value':
        if (options?.fallbackValue === undefined) {
          throw new Error('Fallback value is required for value fallback type');
        }
        return new DefaultValueFallbackStrategy(options.fallbackValue as T);
      case 'cache':
        if (!options?.cache) {
          throw new Error('Cache is required for cache fallback type');
        }
        return new CacheFallbackStrategy<T>({
          cache: options.cache,
          ttl: options.cacheTtl,
        });
      default:
        return new DefaultFallbackStrategy<T>();
    }
  }

  /**
   * Create state transition strategy
   */
  static createTransitionStrategy(options?: StrategyFactoryOptions): IStateTransitionStrategy {
    const transitionType = options?.transitionType || 'default';

    switch (transitionType) {
      case 'default':
      default:
        return new DefaultStateTransitionStrategy();
    }
  }

  /**
   * Create all strategies
   */
  static createStrategies<T>(options?: StrategyFactoryOptions): {
    fallback: IFallbackStrategy<T>;
    transition: IStateTransitionStrategy;
  } {
    return {
      fallback: StrategyFactory.createFallbackStrategy<T>(options),
      transition: StrategyFactory.createTransitionStrategy(options),
    };
  }
}
