/**
 * Saga Orchestrator Implementation
 * 
 * Concrete implementation of ISagaOrchestrator.
 * Orchestrates saga execution with step executor and compensation.
 */

import { ISagaOrchestrator, OrchestratorConfig } from '../interfaces/ISagaOrchestrator';
import { SagaStep, SagaResult } from '../types/saga-types';
import { IStepExecutor, StepExecutionContext } from '../interfaces/IStepExecutor';
import { ICompensationOrchestrator } from '../interfaces/ICompensationOrchestrator';
import { ISagaState, SagaStatus } from '../interfaces/ISagaState';
import { IErrorHandler, ErrorContext } from '../interfaces/IErrorHandler';
import { ILogger } from '../interfaces/ILogger';

export class SagaOrchestrator implements ISagaOrchestrator {
  private _config: OrchestratorConfig;
  private readonly _stepExecutor: IStepExecutor;
  private readonly _compensationOrchestrator: ICompensationOrchestrator;
  private readonly _sagaState: ISagaState;
  private readonly _errorHandler: IErrorHandler;
  private readonly _logger: ILogger;

  constructor(
    stepExecutor: IStepExecutor,
    compensationOrchestrator: ICompensationOrchestrator,
    sagaState: ISagaState,
    errorHandler: IErrorHandler,
    logger: ILogger,
  ) {
    this._stepExecutor = stepExecutor;
    this._compensationOrchestrator = compensationOrchestrator;
    this._sagaState = sagaState;
    this._errorHandler = errorHandler;
    this._logger = logger;
    this._config = {
      enableCompensation: true,
      enableLogging: false,
    };
  }

  async orchestrate<T>(steps: SagaStep<T>[], config: OrchestratorConfig): Promise<SagaResult<T>> {
    this._logger.setEnabled(config.enableLogging);
    this._config = config;

    this._sagaState.reset();
    this._sagaState.setTotalSteps(steps.length);
    this._sagaState.setStatus(SagaStatus.RUNNING);

    this._logger.info('Starting saga orchestration', { totalSteps: steps.length });

    const contexts: StepExecutionContext<T>[] = steps.map((step, index) => ({
      step,
      stepIndex: index,
      totalSteps: steps.length,
    }));

    try {
      const executionResults = await this._stepExecutor.executeSteps(contexts);

      for (const result of executionResults) {
        if (result.success) {
          this._sagaState.addExecutedStep(result.stepName);
          this._sagaState.setCurrentStepIndex(result.stepIndex + 1);
        } else {
          throw new Error(result.error);
        }
      }

      this._sagaState.setStatus(SagaStatus.COMPLETED);
      this._logger.info('Saga orchestration completed successfully');

      return {
        success: true,
        data: executionResults[executionResults.length - 1].data,
        executedSteps: this._sagaState.getExecutedSteps(),
        compensatedSteps: [],
      };
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      const errorContext: ErrorContext = {
        operation: 'execution',
        stepIndex: this._sagaState.getCurrentStepIndex(),
      };

      const handledError = this._errorHandler.handle(errorObj, errorContext);
      this._sagaState.setError(handledError.message);

      if (this._config.enableCompensation && handledError.shouldCompensate) {
        this._sagaState.setStatus(SagaStatus.COMPENSATING);
        this._logger.info('Starting compensation');

        const compensationResult = await this._compensationOrchestrator.orchestrateCompensation(
          steps,
          this._sagaState,
          this._config,
        );

        this._sagaState.setStatus(SagaStatus.COMPENSATED);
        this._logger.info('Compensation completed');

        return {
          success: false,
          executedSteps: this._sagaState.getExecutedSteps(),
          compensatedSteps: compensationResult.compensatedSteps,
          error: handledError.message,
        };
      }

      this._sagaState.setStatus(SagaStatus.FAILED);
      this._logger.error('Saga orchestration failed without compensation');

      return {
        success: false,
        executedSteps: this._sagaState.getExecutedSteps(),
        compensatedSteps: [],
        error: handledError.message,
      };
    }
  }

  setConfig(config: Partial<OrchestratorConfig>): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): OrchestratorConfig {
    return { ...this._config };
  }

  getOrchestratorName(): string {
    return 'DefaultSagaOrchestrator';
  }
}
