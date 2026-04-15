/**
 * Decorator Implementation
 * 
 * Concrete implementation of IDecorator.
 * Handles runtime decoration and cross-cutting concerns.
 */

import { IDecorator } from '../interfaces/IDecorator';
import { DecoratorResult, DecoratorConfig } from '../types/decorator-types';

export class Decorator implements IDecorator {
  private _config: DecoratorConfig;

  constructor() {
    this._config = {
      enableLogging: false,
      enableMetrics: false,
    };
  }

  async execute<T>(operation: () => Promise<T>, decorators: string[]): Promise<DecoratorResult<T>> {
    const appliedDecorators: string[] = [];

    try {
      if (this._config.enableLogging) {
        appliedDecorators.push('logging');
      }

      if (this._config.enableMetrics) {
        appliedDecorators.push('metrics');
      }

      const result = await operation();

      return {
        success: true,
        data: result,
        decorators: [...decorators, ...appliedDecorators],
      };
    } catch (error) {
      return {
        success: false,
        decorators: [...decorators, ...appliedDecorators],
        error: error instanceof Error ? error.message : 'Decorator execution failed',
      };
    }
  }

  setConfig(config: DecoratorConfig): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): DecoratorConfig {
    return { ...this._config };
  }
}
