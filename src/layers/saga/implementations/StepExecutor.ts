/**
 * Step Executor Implementation
 * 
 * Concrete implementation of IStepExecutor.
 * Provides sequential step execution with error handling.
 */

import { IStepExecutor, StepExecutionContext, StepExecutionResult } from '../interfaces/IStepExecutor';
import { ILogger } from '../interfaces/ILogger';

export class StepExecutor implements IStepExecutor {
  private readonly _logger: ILogger;
  private readonly _continueOnError: boolean;

  constructor(logger: ILogger, continueOnError: boolean = false) {
    this._logger = logger;
    this._continueOnError = continueOnError;
  }

  async executeStep<T>(context: StepExecutionContext<T>): Promise<StepExecutionResult<T>> {
    const { step, stepIndex, totalSteps } = context;

    try {
      this._logger.debug(`Executing step: ${step.name}`, { stepIndex, totalSteps });
      const data = await step.execute();
      this._logger.info(`Successfully executed step: ${step.name}`, { stepIndex });
      
      return {
        stepName: step.name,
        success: true,
        data,
        stepIndex,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown execution error';
      this._logger.error(`Failed to execute step: ${step.name}`, { error: errorMessage, stepIndex });
      
      return {
        stepName: step.name,
        success: false,
        error: errorMessage,
        stepIndex,
      };
    }
  }

  async executeSteps<T>(contexts: StepExecutionContext<T>[]): Promise<StepExecutionResult<T>[]> {
    const results: StepExecutionResult<T>[] = [];

    for (const context of contexts) {
      const result = await this.executeStep(context);
      results.push(result);

      if (!result.success) {
        const error = new Error(result.error);
        const shouldContinue = this.shouldContinueOnError(error, context);

        if (!shouldContinue) {
          this._logger.warn(`Stopping execution due to error in step: ${context.step.name}`);
          break;
        }
      }
    }

    return results;
  }

  shouldContinueOnError<T>(error: Error, context: StepExecutionContext<T>): boolean {
    return this._continueOnError;
  }

  getExecutorName(): string {
    return 'SequentialStepExecutor';
  }
}
