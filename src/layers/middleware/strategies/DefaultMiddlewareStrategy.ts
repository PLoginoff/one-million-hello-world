/**
 * Default Middleware Strategy
 *
 * Base implementation of the middleware strategy using sequential pipeline execution.
 * This strategy executes middleware stages in order.
 *
 * @module MiddlewareLayer/Strategies
 */

import { IMiddlewareStrategy, MiddlewareStrategyContext, MiddlewareStrategyResult } from './IMiddlewareStrategy';
import { StageType } from '../types/middleware-types';

/**
 * Middleware stage definition.
 */
export interface MiddlewareStage {
  /** Unique name of the stage */
  readonly name: string;
  /** Type of the stage */
  readonly type: StageType;
  /** Execution order (lower = earlier) */
  readonly order: number;
  /** Whether the stage is enabled */
  readonly enabled: boolean;
  /** Stage-specific configuration */
  readonly config?: Record<string, unknown>;
  /** Handler function for the stage */
  readonly handler: (context: MiddlewareStrategyContext) => Promise<{
    success: boolean;
    headers?: Record<string, string>;
    body?: unknown;
    statusCode?: number;
    error?: { code: string; message: string };
    skipRemaining?: boolean;
  }>;
}

/**
 * Default middleware strategy implementation.
 *
 * Executes middleware stages sequentially in order.
 * Supports early termination via statusCode or skipRemaining.
 */
export class DefaultMiddlewareStrategy implements IMiddlewareStrategy {
  readonly name = 'default-middleware';
  readonly priority = 10;

  private readonly stages: MiddlewareStage[] = [];
  private executionCount = 0;

  /**
   * Create a new DefaultMiddlewareStrategy.
   *
   * @param stages - Optional initial stages to register
   */
  constructor(stages: MiddlewareStage[] = []) {
    for (const stage of stages) {
      this.addStage(stage);
    }
    // Sort stages by order
    this.stages.sort((a, b) => a.order - b.order);
  }

  /**
   * Add a middleware stage.
   *
   * @param stage - The stage to add
   */
  addStage(stage: MiddlewareStage): void {
    this.stages.push(stage);
    this.stages.sort((a, b) => a.order - b.order);
  }

  /**
   * Remove a middleware stage by name.
   *
   * @param name - The name of the stage to remove
   * @returns True if the stage was removed
   */
  removeStage(name: string): boolean {
    const index = this.stages.findIndex((s) => s.name === name);
    if (index >= 0) {
      this.stages.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Check if this strategy can handle the given context.
   *
   * @param context - The middleware context to evaluate
   * @returns True if the context has required fields
   */
  canHandle(context: MiddlewareStrategyContext): boolean {
    return (
      context.correlationContext !== undefined && typeof context.method === 'string' && typeof context.path === 'string'
    );
  }

  /**
   * Execute the middleware strategy.
   *
   * Executes all enabled stages in order until completion or early termination.
   *
   * @param context - The middleware context
   * @returns Promise resolving to the middleware result
   */
  async execute(context: MiddlewareStrategyContext): Promise<MiddlewareStrategyResult> {
    const startTime = Date.now();
    this.executionCount++;

    if (!this.canHandle(context)) {
      return {
        success: false,
        error: {
          code: 'INVALID_CONTEXT',
          message: 'Invalid middleware context: correlationContext, method, and path are required',
        },
        metadata: {
          strategyName: this.name,
          executionTimeMs: Date.now() - startTime,
          stagesExecuted: 0,
          stagesSkipped: 0,
        },
      };
    }

    let currentHeaders = { ...context.headers };
    let currentBody = context.body;
    let stagesExecuted = 0;
    let stagesSkipped = 0;

    for (const stage of this.stages) {
      if (!stage.enabled) {
        stagesSkipped++;
        continue;
      }

      stagesExecuted++;

      try {
        const stageContext: MiddlewareStrategyContext = {
          ...context,
          headers: currentHeaders,
          body: currentBody,
        };

        const result = await stage.handler(stageContext);

        if (result.headers) {
          currentHeaders = { ...currentHeaders, ...result.headers };
        }
        if (result.body !== undefined) {
          currentBody = result.body;
        }

        if (!result.success) {
          return {
            success: false,
            headers: currentHeaders,
            body: currentBody,
            statusCode: result.statusCode,
            error: result.error ?? { code: 'STAGE_FAILED', message: `Stage ${stage.name} failed` },
            metadata: {
              strategyName: this.name,
              executionTimeMs: Date.now() - startTime,
              stagesExecuted,
              stagesSkipped,
            },
          };
        }

        if (result.statusCode) {
          return {
            success: true,
            headers: currentHeaders,
            body: currentBody,
            statusCode: result.statusCode,
            metadata: {
              strategyName: this.name,
              executionTimeMs: Date.now() - startTime,
              stagesExecuted,
              stagesSkipped,
            },
          };
        }

        if (result.skipRemaining) {
          break;
        }
      } catch (error) {
        return {
          success: false,
          headers: currentHeaders,
          body: currentBody,
          error: {
            code: 'STAGE_ERROR',
            message: error instanceof Error ? error.message : 'Unknown stage error',
          },
          metadata: {
            strategyName: this.name,
            executionTimeMs: Date.now() - startTime,
            stagesExecuted,
            stagesSkipped,
          },
        };
      }
    }

    return {
      success: true,
      headers: currentHeaders,
      body: currentBody,
      metadata: {
        strategyName: this.name,
        executionTimeMs: Date.now() - startTime,
        stagesExecuted,
        stagesSkipped,
      },
    };
  }

  /**
   * Get the number of times this strategy has been executed.
   *
   * @returns Execution count
   */
  getExecutionCount(): number {
    return this.executionCount;
  }

  /**
   * Get all registered stages.
   *
   * @returns Array of registered stages
   */
  getStages(): MiddlewareStage[] {
    return [...this.stages];
  }

  /**
   * Clear all registered stages.
   */
  clearStages(): void {
    this.stages.length = 0;
  }

  /**
   * Enable or disable a stage by name.
   *
   * @param name - The stage name
   * @param enabled - Whether to enable the stage
   * @returns True if the stage was found and updated
   */
  setStageEnabled(name: string, enabled: boolean): boolean {
    const stage = this.stages.find((s) => s.name === name);
    if (stage) {
      // Since stages are readonly, we need to replace
      const index = this.stages.indexOf(stage);
      this.stages[index] = {
        ...stage,
        enabled,
      };
      return true;
    }
    return false;
  }
}
