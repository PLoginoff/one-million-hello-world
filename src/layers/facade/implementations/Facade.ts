/**
 * Facade Implementation
 * 
 * Concrete implementation of IFacade.
 * Handles simplified interfaces, aggregation, and composition.
 */

import { IFacade } from '../interfaces/IFacade';
import { FacadeResult, FacadeConfig } from '../types/facade-types';

export class Facade implements IFacade {
  private _config: FacadeConfig;

  constructor() {
    this._config = {
      enableAggregation: true,
      enableComposition: true,
    };
  }

  async execute<T>(operations: (() => Promise<T>)[]): Promise<FacadeResult<T[]>> {
    const executedOperations: string[] = [];
    const results: T[] = [];

    try {
      for (let i = 0; i < operations.length; i++) {
        const operation = operations[i];
        if (operation) {
          const result = await operation();
          results.push(result);
          executedOperations.push(`operation_${i}`);
        }
      }

      return {
        success: true,
        data: results,
        operations: executedOperations,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Facade execution failed';
      return {
        success: false,
        operations: executedOperations,
        error: errorMessage,
      };
    }
  }

  setConfig(config: FacadeConfig): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): FacadeConfig {
    return { ...this._config };
  }
}
