/**
 * Middleware Factory
 * 
 * Factory for creating middleware components and configurations.
 */

import { MiddlewareConfigBuilder } from '../configuration/builders/MiddlewareConfigBuilder';
import { DefaultConfigs, MiddlewareConfigOptions } from '../configuration/defaults/DefaultConfigs';
import { MiddlewareEntity } from '../domain/entities/MiddlewareEntity';
import { MiddlewareContextEntity } from '../domain/entities/MiddlewareContextEntity';
import { MiddlewareExecutionOrderValueObject } from '../domain/value-objects/MiddlewareExecutionOrderValueObject';
import { MiddlewareChainService, MiddlewareFunction } from '../domain/services/MiddlewareChainService';
import { MiddlewarePipelineService, PipelineHandler } from '../domain/services/MiddlewarePipelineService';
import { MiddlewareStatistics } from '../statistics/MiddlewareStatistics';
import { SequentialExecutionStrategy } from '../strategies/strategy/SequentialExecutionStrategy';
import { ParallelExecutionStrategy } from '../strategies/strategy/ParallelExecutionStrategy';
import { IMiddlewareStrategy } from '../strategies/strategy/IMiddlewareStrategy';

export class MiddlewareFactory {
  /**
   * Create default middleware configuration
   */
  static createDefaultConfig(): MiddlewareConfigOptions {
    return MiddlewareConfigBuilder.create().build();
  }

  /**
   * Create development middleware configuration
   */
  static createDevelopmentConfig(): MiddlewareConfigOptions {
    return MiddlewareConfigBuilder.development().build();
  }

  /**
   * Create production middleware configuration
   */
  static createProductionConfig(): MiddlewareConfigOptions {
    return MiddlewareConfigBuilder.production().build();
  }

  /**
   * Create high-performance middleware configuration
   */
  static createHighPerformanceConfig(): MiddlewareConfigOptions {
    return MiddlewareConfigBuilder.highPerformance().build();
  }

  /**
   * Create custom middleware configuration
   */
  static createCustomConfig(options: Partial<MiddlewareConfigOptions>): MiddlewareConfigOptions {
    return MiddlewareConfigBuilder.create()
      .withErrorHandling(options.enableErrorHandling ?? DefaultConfigs.DEFAULT.enableErrorHandling)
      .withLogging(options.enableLogging ?? DefaultConfigs.DEFAULT.enableLogging)
      .withMetrics(options.enableMetrics ?? DefaultConfigs.DEFAULT.enableMetrics)
      .withDefaultPriority(options.defaultPriority ?? DefaultConfigs.DEFAULT.defaultPriority)
      .withParallelExecution(options.enableParallelExecution ?? DefaultConfigs.DEFAULT.enableParallelExecution)
      .withMaxMiddlewareDepth(options.maxMiddlewareDepth ?? DefaultConfigs.DEFAULT.maxMiddlewareDepth)
      .withTimeout(options.timeout ?? DefaultConfigs.DEFAULT.timeout)
      .build();
  }

  /**
   * Create middleware chain service
   */
  static createMiddlewareChainService(): MiddlewareChainService {
    return new MiddlewareChainService();
  }

  /**
   * Create middleware pipeline service
   */
  static createMiddlewarePipelineService(): MiddlewarePipelineService {
    return new MiddlewarePipelineService();
  }

  /**
   * Create sequential execution strategy
   */
  static createSequentialStrategy(): SequentialExecutionStrategy {
    return new SequentialExecutionStrategy();
  }

  /**
   * Create parallel execution strategy
   */
  static createParallelStrategy(): ParallelExecutionStrategy {
    return new ParallelExecutionStrategy();
  }

  /**
   * Create middleware statistics
   */
  static createMiddlewareStatistics(): MiddlewareStatistics {
    return new MiddlewareStatistics();
  }

  /**
   * Create request middleware entity
   */
  static createRequestMiddleware(id: string, name: string, priority: number = 0): MiddlewareEntity {
    return MiddlewareEntity.createRequest(id, name, priority);
  }

  /**
   * Create response middleware entity
   */
  static createResponseMiddleware(id: string, name: string, priority: number = 0): MiddlewareEntity {
    return MiddlewareEntity.createResponse(id, name, priority);
  }

  /**
   * Create error middleware entity
   */
  static createErrorMiddleware(id: string, name: string, priority: number = 0): MiddlewareEntity {
    return MiddlewareEntity.createError(id, name, priority);
  }

  /**
   * Create global middleware entity
   */
  static createGlobalMiddleware(id: string, name: string, priority: number = 0): MiddlewareEntity {
    return MiddlewareEntity.createGlobal(id, name, priority);
  }

  /**
   * Create middleware context
   */
  static createMiddlewareContext(request: any, response: any): MiddlewareContextEntity {
    return MiddlewareContextEntity.create(request, response);
  }

  /**
   * Create execution order (first)
   */
  static createFirstOrder(): MiddlewareExecutionOrderValueObject {
    return MiddlewareExecutionOrderValueObject.first();
  }

  /**
   * Create execution order (last)
   */
  static createLastOrder(): MiddlewareExecutionOrderValueObject {
    return MiddlewareExecutionOrderValueObject.last();
  }

  /**
   * Create execution order (before)
   */
  static createBeforeOrder(referenceId: string): MiddlewareExecutionOrderValueObject {
    return MiddlewareExecutionOrderValueObject.before(referenceId);
  }

  /**
   * Create execution order (after)
   */
  static createAfterOrder(referenceId: string): MiddlewareExecutionOrderValueObject {
    return MiddlewareExecutionOrderValueObject.after(referenceId);
  }

  /**
   * Create complete middleware stack with default configuration
   */
  static createDefaultStack(): {
    config: MiddlewareConfigOptions;
    chain: MiddlewareChainService;
    pipeline: MiddlewarePipelineService;
    strategy: IMiddlewareStrategy;
    statistics: MiddlewareStatistics;
  } {
    return {
      config: this.createDefaultConfig(),
      chain: this.createMiddlewareChainService(),
      pipeline: this.createMiddlewarePipelineService(),
      strategy: this.createSequentialStrategy(),
      statistics: this.createMiddlewareStatistics(),
    };
  }

  /**
   * Create development middleware stack
   */
  static createDevelopmentStack(): {
    config: MiddlewareConfigOptions;
    chain: MiddlewareChainService;
    pipeline: MiddlewarePipelineService;
    strategy: IMiddlewareStrategy;
    statistics: MiddlewareStatistics;
  } {
    return {
      config: this.createDevelopmentConfig(),
      chain: this.createMiddlewareChainService(),
      pipeline: this.createMiddlewarePipelineService(),
      strategy: this.createSequentialStrategy(),
      statistics: this.createMiddlewareStatistics(),
    };
  }

  /**
   * Create production middleware stack
   */
  static createProductionStack(): {
    config: MiddlewareConfigOptions;
    chain: MiddlewareChainService;
    pipeline: MiddlewarePipelineService;
    strategy: IMiddlewareStrategy;
    statistics: MiddlewareStatistics;
  } {
    return {
      config: this.createProductionConfig(),
      chain: this.createMiddlewareChainService(),
      pipeline: this.createMiddlewarePipelineService(),
      strategy: this.createParallelStrategy(),
      statistics: this.createMiddlewareStatistics(),
    };
  }
}
