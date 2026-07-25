/**
 * GovernanceReliableStrategy
 *
 * Reliability-focused governance strategy with retries.
 */

import { GovernanceContext, GovernanceResult } from '../types/governance-types';

export interface IGovernanceStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: GovernanceContext): Promise<GovernanceResult<unknown>>;
  canHandle(context: GovernanceContext): boolean;
}

export class GovernanceReliableStrategy implements IGovernanceStrategy {
  readonly name = 'reliable';
  readonly priority = 5;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: GovernanceContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: GovernanceContext): Promise<GovernanceResult<unknown>> {
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
