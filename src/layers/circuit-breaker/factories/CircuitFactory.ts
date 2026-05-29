/**
 * Circuit Breaker Factory
 * 
 * Factory for creating circuit breaker instances with proper configuration.
 */

import { CircuitConfigBuilder, CircuitConfig } from '../configuration/builders/CircuitConfigBuilder';
import { CircuitDefaults } from '../configuration/defaults/CircuitDefaults';
import { CircuitMetrics } from '../domain/value-objects/CircuitMetrics';
import { CircuitStateEntity } from '../domain/entities/CircuitState';
import { DefaultFallbackStrategy } from '../strategies/fallback/DefaultFallbackStrategy';
import { DefaultValueFallbackStrategy } from '../strategies/fallback/DefaultValueFallbackStrategy';
import { CacheFallbackStrategy } from '../strategies/fallback/CacheFallbackStrategy';
import { DefaultStateTransitionStrategy } from '../strategies/state-transition/StateTransitionStrategy';

export interface CircuitFactoryOptions {
  preset?: 'default' | 'strict' | 'lenient' | 'development' | 'production' | 'high-traffic' | 'low-latency';
  name?: string;
  tags?: string[];
  fallbackValue?: unknown;
  cache?: Map<string, unknown>;
}

export class CircuitFactory {
  /**
   * Create circuit breaker with default configuration
   */
  static createDefault(options?: CircuitFactoryOptions): CircuitInstance {
    const config = CircuitFactory._buildConfig(options, 'default');
    return CircuitFactory._createInstance(config, options);
  }

  /**
   * Create circuit breaker with strict configuration
   */
  static createStrict(options?: CircuitFactoryOptions): CircuitInstance {
    const config = CircuitFactory._buildConfig(options, 'strict');
    return CircuitFactory._createInstance(config, options);
  }

  /**
   * Create circuit breaker with lenient configuration
   */
  static createLenient(options?: CircuitFactoryOptions): CircuitInstance {
    const config = CircuitFactory._buildConfig(options, 'lenient');
    return CircuitFactory._createInstance(config, options);
  }

  /**
   * Create circuit breaker with development configuration
   */
  static createDevelopment(options?: CircuitFactoryOptions): CircuitInstance {
    const config = CircuitFactory._buildConfig(options, 'development');
    return CircuitFactory._createInstance(config, options);
  }

  /**
   * Create circuit breaker with production configuration
   */
  static createProduction(options?: CircuitFactoryOptions): CircuitInstance {
    const config = CircuitFactory._buildConfig(options, 'production');
    return CircuitFactory._createInstance(config, options);
  }

  /**
   * Create circuit breaker with custom configuration
   */
  static createCustom(config: CircuitConfig): CircuitInstance {
    return CircuitFactory._createInstance(config);
  }

  /**
   * Create circuit breaker from builder
   */
  static fromBuilder(builder: CircuitConfigBuilder): CircuitInstance {
    const config = builder.build();
    return CircuitFactory._createInstance(config);
  }

  private static _buildConfig(options?: CircuitFactoryOptions, preset: string = 'default'): CircuitConfig {
    let defaults;

    switch (preset) {
      case 'strict':
        defaults = CircuitDefaults.getStrict();
        break;
      case 'lenient':
        defaults = CircuitDefaults.getLenient();
        break;
      case 'development':
        defaults = CircuitDefaults.getDevelopment();
        break;
      case 'production':
        defaults = CircuitDefaults.getProduction();
        break;
      case 'high-traffic':
        defaults = CircuitDefaults.getHighTraffic();
        break;
      case 'low-latency':
        defaults = CircuitDefaults.getLowLatency();
        break;
      default:
        defaults = CircuitDefaults.getDefault();
    }

    const builder = new CircuitConfigBuilder(defaults);

    if (options?.name) {
      builder.withName(options.name);
    }

    if (options?.tags) {
      builder.withTags(options.tags);
    }

    return builder.build();
  }

  private static _createInstance(config: CircuitConfig, options?: CircuitFactoryOptions): CircuitInstance {
    const metrics = new CircuitMetrics();
    const state = new CircuitStateEntity();

    let fallbackStrategy: DefaultFallbackStrategy<unknown>;

    if (options?.fallbackValue !== undefined) {
      fallbackStrategy = new DefaultValueFallbackStrategy(options.fallbackValue);
    } else if (options?.cache) {
      fallbackStrategy = new CacheFallbackStrategy({ cache: options.cache });
    } else {
      fallbackStrategy = new DefaultFallbackStrategy();
    }

    const transitionStrategy = new DefaultStateTransitionStrategy();

    return {
      config,
      metrics,
      state,
      fallbackStrategy,
      transitionStrategy,
    };
  }
}

export interface CircuitInstance {
  config: CircuitConfig;
  metrics: CircuitMetrics;
  state: CircuitStateEntity;
  fallbackStrategy: DefaultFallbackStrategy<unknown>;
  transitionStrategy: DefaultStateTransitionStrategy;
}
