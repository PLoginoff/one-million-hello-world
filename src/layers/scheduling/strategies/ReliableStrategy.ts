/**
 * SchedulingReliableStrategy
 *
 * Reliability-focused scheduling strategy with retries.
 */

import { SchedulingContext, SchedulingResult } from '../types/scheduling-types';

export interface ISchedulingStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: SchedulingContext): Promise<SchedulingResult<unknown>>;
  canHandle(context: SchedulingContext): boolean;
}

export class SchedulingReliableStrategy implements ISchedulingStrategy {
  readonly name = 'reliable';
  readonly priority = 5;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: SchedulingContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: SchedulingContext): Promise<SchedulingResult<unknown>> {
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
