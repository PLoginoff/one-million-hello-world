/**
 * Default Saga Strategy
 *
 * Provides the base implementation for saga execution with sequential
 * step execution and backward compensation on failure.
 *
 * @module SagaLayer/Strategies
 */

import { ISagaStrategy, SagaContext, SagaStrategyResult } from './ISagaStrategy';
import { SagaConfig, SagaStep } from '../types/saga-types';

/**
 * Default implementation of saga strategy
 *
 * Executes steps sequentially and compensates in reverse order on failure.
 *
 * @typeParam T - The type of result returned by the saga
 */
export class DefaultSagaStrategy<T = unknown> implements ISagaStrategy<T> {
  readonly name = 'default';
  readonly priority = 10;

  private _executionCount: number = 0;
  private _totalStepsExecuted: number = 0;
  private _totalStepsCompensated: number = 0;
  private _totalSuccesses: number = 0;
  private _totalFailures: number = 0;

  /**
   * Creates a new DefaultSagaStrategy
   */
  constructor() {
    // Initialize with default values
  }

  /**
   * Gets the total number of saga executions
   *
   * @returns Number of executions
   */
  getExecutionCount(): number {
    return this._executionCount;
  }

  /**
   * Gets the total number of steps executed across all sagas
   *
   * @returns Total steps executed
   */
  getTotalStepsExecuted(): number {
    return this._totalStepsExecuted;
  }

  /**
   * Gets the total number of steps compensated across all sagas
   *
   * @returns Total steps compensated
   */
  getTotalStepsCompensated(): number {
    return this._totalStepsCompensated;
  }

  /**
   * Gets the total number of successful saga executions
   *
   * @returns Total successes
   */
  getTotalSuccesses(): number {
    return this._totalSuccesses;
  }

  /**
   * Gets the total number of failed saga executions
   *
   * @returns Total failures
   */
  getTotalFailures(): number {
    return this._totalFailures;
  }

  /**
   * Resets all counters
   */
  reset(): void {
    this._executionCount = 0;
    this._totalStepsExecuted = 0;
    this._totalStepsCompensated = 0;
    this._totalSuccesses = 0;
    this._totalFailures = 0;
  }

  /**
   * Executes a saga with the given steps
   *
   * @param context - Execution context
   * @returns Strategy execution result
   */
  async execute(context: SagaContext<T>): Promise<SagaStrategyResult<T>> {
    const startTime = Date.now();
    this._executionCount++;
    const executedSteps: string[] = [];
    const stepDurationsMs = new Map<string, number>();
    let lastStepData: T | undefined;

    try {
      // Execute each step sequentially
      for (let i = context.currentStepIndex; i < context.steps.length; i++) {
        const step = context.steps[i];
        const stepStartTime = Date.now();

        // Execute the step
        const stepResult = await step.execute();
        const stepDurationMs = Date.now() - stepStartTime;

        // Store step data for potential compensation
        context.stepData.set(step.name, stepResult);
        lastStepData = stepResult;
        executedSteps.push(step.name);
        stepDurationsMs.set(step.name, stepDurationMs);
        this._totalStepsExecuted++;
      }

      this._totalSuccesses++;

      return {
        success: true,
        data: lastStepData,
        executedSteps,
        compensatedSteps: [],
        durationMs: Date.now() - startTime,
        stepDurationsMs,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Compensate executed steps in reverse order
      const compensatedSteps = await this.compensate(context, executedSteps, context.stepData);

      this._totalFailures++;

      return {
        success: false,
        error: errorMessage,
        executedSteps,
        compensatedSteps: compensatedSteps.filter((c) => c.success).map((c) => c.stepName),
        durationMs: Date.now() - startTime,
        stepDurationsMs,
      };
    }
  }

  /**
   * Compensates executed steps in reverse order
   *
   * @param context - Execution context
   * @param executedSteps - Names of steps that were executed
   * @param stepData - Data from executed steps
   * @returns Array of compensation results
   */
  async compensate(
    context: SagaContext<T>,
    executedSteps: string[],
    stepData: Map<string, T>
  ): Promise<Array<{ stepName: string; success: boolean; error?: string }>> {
    const results: Array<{ stepName: string; success: boolean; error?: string }> = [];

    // Compensate in reverse order (backward compensation)
    for (let i = executedSteps.length - 1; i >= 0; i--) {
      const stepName = executedSteps[i];
      const step = context.steps.find((s) => s.name === stepName);
      const data = stepData.get(stepName);

      if (step && data !== undefined) {
        this._totalStepsCompensated++;
        try {
          await step.compensate(data);
          results.push({ stepName, success: true });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          results.push({ stepName, success: false, error: errorMessage });
        }
      }
    }

    return results;
  }

  /**
   * Determines if this strategy can handle the given context
   *
   * @param context - Execution context to evaluate
   * @returns True if strategy can handle the context
   */
  canHandle(context: SagaContext<unknown>): boolean {
    return (
      context !== null &&
      context !== undefined &&
      Array.isArray(context.steps) &&
      context.steps.length > 0 &&
      context.steps.every((step) => typeof step.execute === 'function' && typeof step.compensate === 'function') &&
      context.config !== undefined
    );
  }
}
