/**
 * Saga Manager Implementation
 * 
 * Concrete implementation of ISagaManager.
 * Handles distributed transactions and compensation.
 */

import { ISagaManager } from '../interfaces/ISagaManager';
import { SagaStep, SagaResult, SagaConfig } from '../types/saga-types';

export class SagaManager implements ISagaManager {
  private _config: SagaConfig;

  constructor() {
    this._config = {
      enableLogging: false,
      enableCompensation: true,
    };
  }

  async execute<T>(steps: SagaStep<T>[]): Promise<SagaResult<T>> {
    const executedSteps: string[] = [];
    const executedData: T[] = [];

    try {
      for (const step of steps) {
        const result = await step.execute();
        executedSteps.push(step.name);
        executedData.push(result);
      }

      return {
        success: true,
        data: executedData[executedData.length - 1] as T,
        executedSteps,
        compensatedSteps: [],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Saga execution failed';

      if (this._config.enableCompensation) {
        const compensatedSteps: string[] = [];

        for (let i = executedSteps.length - 1; i >= 0; i--) {
          const step = steps[i];
          const data = executedData[i];

          if (step && data !== undefined) {
            try {
              await step.compensate(data);
              compensatedSteps.push(step.name);
            } catch (compensationError) {
              // Ignore compensation errors
            }
          }
        }

        return {
          success: false,
          executedSteps,
          compensatedSteps,
          error: errorMessage,
        };
      }

      return {
        success: false,
        executedSteps,
        compensatedSteps: [],
        error: errorMessage,
      };
    }
  }

  setConfig(config: SagaConfig): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): SagaConfig {
    return { ...this._config };
  }
}
