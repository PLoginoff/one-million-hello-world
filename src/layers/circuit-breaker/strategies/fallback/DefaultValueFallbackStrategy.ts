/**
 * Default Value Fallback Strategy
 * 
 * Fallback strategy that returns a predefined default value.
 */

import { IFallbackStrategy, FallbackContext, FallbackResult } from './IFallbackStrategy';

export class DefaultValueFallbackStrategy<T> implements IFallbackStrategy<T> {
  readonly name: string;
  private readonly _defaultValue: T;

  constructor(defaultValue: T) {
    this.name = 'DefaultValueFallbackStrategy';
    this._defaultValue = defaultValue;
  }

  async execute(_context: FallbackContext<T>): Promise<FallbackResult<T>> {
    return {
      success: true,
      data: this._defaultValue,
      fromFallback: true,
      strategyName: this.name,
    };
  }

  isAvailable(): boolean {
    return true;
  }

  getName(): string {
    return this.name;
  }
}
