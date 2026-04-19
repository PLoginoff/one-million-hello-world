/**
 * Compensation Strategy Implementation
 * 
 * Concrete implementation of ICompensationStrategy.
 * Provides reverse-order compensation with error handling.
 */

import { ICompensationStrategy, CompensationContext, CompensationResult } from '../interfaces/ICompensationStrategy';
import { ILogger } from '../interfaces/ILogger';

export class CompensationStrategy implements ICompensationStrategy {
  private readonly _logger: ILogger;
  private readonly _continueOnError: boolean;

  constructor(logger: ILogger, continueOnError: boolean = true) {
    this._logger = logger;
    this._continueOnError = continueOnError;
  }

  async compensateStep<T>(context: CompensationContext<T>): Promise<CompensationResult> {
    const { step, data, stepIndex } = context;

    try {
      this._logger.debug(`Compensating step: ${step.name}`, { stepIndex, data });
      await step.compensate(data);
      this._logger.info(`Successfully compensated step: ${step.name}`);
      
      return {
        stepName: step.name,
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown compensation error';
      this._logger.error(`Failed to compensate step: ${step.name}`, { error: errorMessage });
      
      return {
        stepName: step.name,
        success: false,
        error: errorMessage,
      };
    }
  }

  async compensateSteps<T>(contexts: CompensationContext<T>[]): Promise<CompensationResult[]> {
    const results: CompensationResult[] = [];

    for (const context of contexts) {
      const result = await this.compensateStep(context);
      results.push(result);

      if (!result.success) {
        const error = new Error(result.error);
        const shouldContinue = this.shouldContinueOnError(error, context);

        if (!shouldContinue) {
          this._logger.warn(`Stopping compensation due to error in step: ${context.step.name}`);
          break;
        }
      }
    }

    return results;
  }

  shouldContinueOnError<T>(error: Error, context: CompensationContext<T>): boolean {
    return this._continueOnError;
  }

  getStrategyName(): string {
    return 'ReverseOrderCompensation';
  }
}
