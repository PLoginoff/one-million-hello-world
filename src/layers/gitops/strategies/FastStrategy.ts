/**
 * GitopsFastStrategy
 *
 * High-performance gitops strategy optimized for speed.
 */

import { GitopsContext, GitopsResult } from '../types/gitops-types';

export interface IGitopsStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: GitopsContext): Promise<GitopsResult<unknown>>;
  canHandle(context: GitopsContext): boolean;
}

export class GitopsFastStrategy implements IGitopsStrategy {
  readonly name = 'fast';
  readonly priority = 10;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: GitopsContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: GitopsContext): Promise<GitopsResult<unknown>> {
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
