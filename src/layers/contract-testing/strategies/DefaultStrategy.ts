/**
 * ContractTestingDefaultStrategy
 *
 * Standard contractTesting strategy with balanced performance.
 */

import { ContractTestingContext, ContractTestingResult } from '../types/contract-testing-types';

export interface IContractTestingStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: ContractTestingContext): Promise<ContractTestingResult<unknown>>;
  canHandle(context: ContractTestingContext): boolean;
}

export class ContractTestingDefaultStrategy implements IContractTestingStrategy {
  readonly name = 'default';
  readonly priority = 0;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: ContractTestingContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: ContractTestingContext): Promise<ContractTestingResult<unknown>> {
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
