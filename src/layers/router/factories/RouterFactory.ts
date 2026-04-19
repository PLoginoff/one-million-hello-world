/**
 * Router Factory
 * 
 * Factory for creating router components and configurations.
 */

import { RouterConfigBuilder } from '../configuration/builders/RouterConfigBuilder';
import { DefaultConfigs, RouterConfigOptions } from '../configuration/defaults/DefaultConfigs';
import { RouteEntity } from '../domain/entities/RouteEntity';
import { HttpMethodValueObject } from '../domain/value-objects/HttpMethodValueObject';
import { RouterService } from '../domain/services/RouterService';
import { RouterStatistics } from '../statistics/RouterStatistics';
import { SequentialRoutingStrategy } from '../strategies/strategy/SequentialRoutingStrategy';
import { TrieRoutingStrategy } from '../strategies/strategy/TrieRoutingStrategy';
import { IRoutingStrategy } from '../strategies/strategy/IRoutingStrategy';

export class RouterFactory {
  /**
   * Create default router configuration
   */
  static createDefaultConfig(): RouterConfigOptions {
    return RouterConfigBuilder.create().build();
  }

  /**
   * Create development router configuration
   */
  static createDevelopmentConfig(): RouterConfigOptions {
    return RouterConfigBuilder.development().build();
  }

  /**
   * Create production router configuration
   */
  static createProductionConfig(): RouterConfigOptions {
    return RouterConfigBuilder.production().build();
  }

  /**
   * Create strict router configuration
   */
  static createStrictConfig(): RouterConfigOptions {
    return RouterConfigBuilder.strict().build();
  }

  /**
   * Create custom router configuration
   */
  static createCustomConfig(options: Partial<RouterConfigOptions>): RouterConfigOptions {
    return RouterConfigBuilder.create()
      .withCaseSensitive(options.enableCaseSensitive ?? DefaultConfigs.DEFAULT.enableCaseSensitive)
      .withStrictRouting(options.enableStrictRouting ?? DefaultConfigs.DEFAULT.enableStrictRouting)
      .withTrailingSlash(options.enableTrailingSlash ?? DefaultConfigs.DEFAULT.enableTrailingSlash)
      .withDefaultPriority(options.defaultPriority ?? DefaultConfigs.DEFAULT.defaultPriority)
      .withMaxRoutes(options.maxRoutes ?? DefaultConfigs.DEFAULT.maxRoutes)
      .withAutoRegistration(options.enableAutoRegistration ?? DefaultConfigs.DEFAULT.enableAutoRegistration)
      .build();
  }

  /**
   * Create router service
   */
  static createRouterService(): RouterService {
    return new RouterService();
  }

  /**
   * Create sequential routing strategy
   */
  static createSequentialStrategy(): SequentialRoutingStrategy {
    return new SequentialRoutingStrategy();
  }

  /**
   * Create trie routing strategy
   */
  static createTrieStrategy(): TrieRoutingStrategy {
    return new TrieRoutingStrategy();
  }

  /**
   * Create router statistics
   */
  static createRouterStatistics(): RouterStatistics {
    return new RouterStatistics();
  }

  /**
   * Create GET route
   */
  static createGetRoute(id: string, path: string, handler: string): RouteEntity {
    return RouteEntity.get(id, path, handler);
  }

  /**
   * Create POST route
   */
  static createPostRoute(id: string, path: string, handler: string): RouteEntity {
    return RouteEntity.post(id, path, handler);
  }

  /**
   * Create PUT route
   */
  static createPutRoute(id: string, path: string, handler: string): RouteEntity {
    return RouteEntity.put(id, path, handler);
  }

  /**
   * Create DELETE route
   */
  static createDeleteRoute(id: string, path: string, handler: string): RouteEntity {
    return RouteEntity.delete(id, path, handler);
  }

  /**
   * Create HTTP method value object (GET)
   */
  static createGetMethod(): HttpMethodValueObject {
    return HttpMethodValueObject.get();
  }

  /**
   * Create HTTP method value object (POST)
   */
  static createPostMethod(): HttpMethodValueObject {
    return HttpMethodValueObject.post();
  }

  /**
   * Create HTTP method value object (PUT)
   */
  static createPutMethod(): HttpMethodValueObject {
    return HttpMethodValueObject.put();
  }

  /**
   * Create HTTP method value object (DELETE)
   */
  static createDeleteMethod(): HttpMethodValueObject {
    return HttpMethodValueObject.delete();
  }

  /**
   * Create complete router stack with default configuration
   */
  static createDefaultStack(): {
    config: RouterConfigOptions;
    service: RouterService;
    strategy: IRoutingStrategy;
    statistics: RouterStatistics;
  } {
    return {
      config: this.createDefaultConfig(),
      service: this.createRouterService(),
      strategy: this.createSequentialStrategy(),
      statistics: this.createRouterStatistics(),
    };
  }

  /**
   * Create development router stack
   */
  static createDevelopmentStack(): {
    config: RouterConfigOptions;
    service: RouterService;
    strategy: IRoutingStrategy;
    statistics: RouterStatistics;
  } {
    return {
      config: this.createDevelopmentConfig(),
      service: this.createRouterService(),
      strategy: this.createSequentialStrategy(),
      statistics: this.createRouterStatistics(),
    };
  }

  /**
   * Create production router stack
   */
  static createProductionStack(): {
    config: RouterConfigOptions;
    service: RouterService;
    strategy: IRoutingStrategy;
    statistics: RouterStatistics;
  } {
    return {
      config: this.createProductionConfig(),
      service: this.createRouterService(),
      strategy: this.createTrieStrategy(),
      statistics: this.createRouterStatistics(),
    };
  }
}
