/**
 * Saga Manager Implementation
 * 
 * Concrete implementation of ISagaManager.
 * Orchestrates distributed transactions with compensation
 * using multiple abstraction layers.
 */

import { ISagaManager } from '../interfaces/ISagaManager';
import { SagaStep, SagaResult, SagaConfig } from '../types/saga-types';
import { ISagaOrchestrator, OrchestratorConfig } from '../interfaces/ISagaOrchestrator';
import { ISagaValidator } from '../interfaces/ISagaValidator';
import { ILogger } from '../interfaces/ILogger';
import { Logger } from './Logger';
import { SagaValidator } from './SagaValidator';
import { SagaOrchestrator } from './SagaOrchestrator';
import { StepExecutor } from './StepExecutor';
import { CompensationOrchestrator } from './CompensationOrchestrator';
import { CompensationStrategy } from './CompensationStrategy';
import { ErrorHandler } from './ErrorHandler';
import { SagaState } from './SagaState';

export class SagaManager implements ISagaManager {
  private _config: SagaConfig;
  private readonly _logger: ILogger;
  private readonly _validator: ISagaValidator;
  private readonly _orchestrator: ISagaOrchestrator;

  constructor() {
    this._config = {
      enableLogging: false,
      enableCompensation: true,
    };

    this._logger = new Logger();
    this._validator = new SagaValidator(this._logger);

    const sagaState = new SagaState(this._logger);
    const errorHandler = new ErrorHandler(this._logger);
    const compensationStrategy = new CompensationStrategy(this._logger, true);
    const compensationOrchestrator = new CompensationOrchestrator(
      compensationStrategy,
      errorHandler,
      this._logger,
    );
    const stepExecutor = new StepExecutor(this._logger, false);

    this._orchestrator = new SagaOrchestrator(
      stepExecutor,
      compensationOrchestrator,
      sagaState,
      errorHandler,
      this._logger,
    );
  }

  async execute<T>(steps: SagaStep<T>[]): Promise<SagaResult<T>> {
    this._logger.setEnabled(this._config.enableLogging);

    const validationResult = this._validator.validateSteps(steps);

    if (!validationResult.isValid) {
      const errorMessage = validationResult.errors.map((e) => e.message).join('; ');
      this._logger.error('Saga validation failed', { errors: validationResult.errors });

      return {
        success: false,
        executedSteps: [],
        compensatedSteps: [],
        error: `Validation failed: ${errorMessage}`,
      };
    }

    if (validationResult.warnings.length > 0) {
      this._logger.warn('Saga validation warnings', { warnings: validationResult.warnings });
    }

    const orchestratorConfig: OrchestratorConfig = {
      enableCompensation: this._config.enableCompensation,
      enableLogging: this._config.enableLogging,
    };

    return this._orchestrator.orchestrate(steps, orchestratorConfig);
  }

  setConfig(config: SagaConfig): void {
    this._config = { ...this._config, ...config };
    this._logger.setEnabled(this._config.enableLogging);
  }

  getConfig(): SagaConfig {
    return { ...this._config };
  }
}
