/**
 * Compensation Orchestrator Implementation
 * 
 * Concrete implementation of ICompensationOrchestrator.
 * Orchestrates compensation with compensation strategy.
 */

import { ICompensationOrchestrator, CompensationResult } from '../interfaces/ICompensationOrchestrator';
import { SagaStep } from '../types/saga-types';
import { ISagaState } from '../interfaces/ISagaState';
import { OrchestratorConfig } from '../interfaces/ISagaOrchestrator';
import { ICompensationStrategy, CompensationContext } from '../interfaces/ICompensationStrategy';
import { IErrorHandler, ErrorContext } from '../interfaces/IErrorHandler';
import { ILogger } from '../interfaces/ILogger';

export class CompensationOrchestrator implements ICompensationOrchestrator {
  private readonly _compensationStrategy: ICompensationStrategy;
  private readonly _errorHandler: IErrorHandler;
  private readonly _logger: ILogger;

  constructor(
    compensationStrategy: ICompensationStrategy,
    errorHandler: IErrorHandler,
    logger: ILogger,
  ) {
    this._compensationStrategy = compensationStrategy;
    this._errorHandler = errorHandler;
    this._logger = logger;
  }

  async orchestrateCompensation<T>(
    steps: SagaStep<T>[],
    sagaState: ISagaState,
    config: OrchestratorConfig,
  ): Promise<CompensationResult> {
    const executedSteps = sagaState.getExecutedSteps();
    const compensatedSteps: string[] = [];
    const failedSteps: string[] = [];

    this._logger.info('Starting compensation orchestration', { executedSteps });

    const compensationContexts: CompensationContext<T>[] = [];

    for (let i = executedSteps.length - 1; i >= 0; i--) {
      const stepName = executedSteps[i];
      const stepIndex = steps.findIndex((s) => s.name === stepName);

      if (stepIndex === -1) {
        this._logger.warn(`Step not found for compensation: ${stepName}`);
        continue;
      }

      const step = steps[stepIndex];

      compensationContexts.push({
        step,
        data: undefined as T,
        stepIndex,
        totalSteps: steps.length,
      });
    }

    const compensationResults = await this._compensationStrategy.compensateSteps(compensationContexts);

    for (const result of compensationResults) {
      if (result.success) {
        compensatedSteps.push(result.stepName);
        sagaState.addCompensatedStep(result.stepName);
      } else {
        failedSteps.push(result.stepName);

        const errorContext: ErrorContext = {
          stepName: result.stepName,
          operation: 'compensation',
        };

        const error = new Error(result.error || 'Compensation failed');
        this._errorHandler.handle(error, errorContext);
      }
    }

    this._logger.info('Compensation orchestration completed', {
      compensatedSteps,
      failedSteps,
    });

    return {
      compensatedSteps,
      failedSteps,
      success: failedSteps.length === 0,
      error: failedSteps.length > 0 ? `${failedSteps.length} steps failed to compensate` : undefined,
    };
  }

  getOrchestratorName(): string {
    return 'DefaultCompensationOrchestrator';
  }
}
