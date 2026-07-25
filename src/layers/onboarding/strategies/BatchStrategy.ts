/**
 * OnboardingBatchStrategy
 *
 * Batch-oriented onboarding strategy for bulk operations.
 */

import { OnboardingContext, OnboardingResult } from '../types/onboarding-types';

export interface IOnboardingStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: OnboardingContext): Promise<OnboardingResult<unknown>>;
  canHandle(context: OnboardingContext): boolean;
}

export class OnboardingBatchStrategy implements IOnboardingStrategy {
  readonly name = 'batch';
  readonly priority = 3;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: OnboardingContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: OnboardingContext): Promise<OnboardingResult<unknown>> {
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
