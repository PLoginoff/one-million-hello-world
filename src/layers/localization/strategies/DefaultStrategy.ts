/**
 * LocalizationDefaultStrategy
 *
 * Standard localization strategy with balanced performance.
 */

import { LocalizationContext, LocalizationResult } from '../types/localization-types';

export interface ILocalizationStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: LocalizationContext): Promise<LocalizationResult<unknown>>;
  canHandle(context: LocalizationContext): boolean;
}

export class LocalizationDefaultStrategy implements ILocalizationStrategy {
  readonly name = 'default';
  readonly priority = 0;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: LocalizationContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: LocalizationContext): Promise<LocalizationResult<unknown>> {
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
