/**
 * Default Fallback Strategy
 * 
 * Default implementation that throws error when circuit is open.
 */

import { IFallbackStrategy, FallbackContext, FallbackResult } from './IFallbackStrategy';

export class DefaultFallbackStrategy<T> implements IFallbackStrategy<T> {
  readonly name: string;

  constructor() {
    this.name = 'DefaultFallbackStrategy';
  }

  async execute(context: FallbackContext<T>): Promise<FallbackResult<T>> {
    return {
      success: false,
      error: `Circuit is open: ${context.originalError.message}`,
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
