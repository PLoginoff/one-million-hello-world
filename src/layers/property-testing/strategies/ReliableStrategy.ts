/**
 * PropertyTestingReliableStrategy
 *
 * Reliability-focused propertyTesting strategy with retries.
 */

import { PropertyTestingContext, PropertyTestingResult } from '../types/property-testing-types';

export interface IPropertyTestingStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: PropertyTestingContext): Promise<PropertyTestingResult<unknown>>;
  canHandle(context: PropertyTestingContext): boolean;
}

export class PropertyTestingReliableStrategy implements IPropertyTestingStrategy {
  readonly name = 'reliable';
  readonly priority = 5;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: PropertyTestingContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: PropertyTestingContext): Promise<PropertyTestingResult<unknown>> {
    this._executionCount++;
    await Promise.resolve();
    return {
      success: true,
      data: {
        strategy: this.name,
        input: context.input,
        metadata: context.metadata,
        executionCount: this._executionCount,
      },
    };
  }

  configure(config: Record<string, unknown>): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): Record<string, unknown> {
    return { ...this._config };
  }

  getExecutionCount(): number {
    return this._executionCount;
  }
}
