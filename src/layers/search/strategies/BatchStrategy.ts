/**
 * SearchBatchStrategy
 *
 * Batch-oriented search strategy for bulk operations.
 */

import { SearchContext, SearchResult } from '../types/search-types';

export interface ISearchStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: SearchContext): Promise<SearchResult<unknown>>;
  canHandle(context: SearchContext): boolean;
}

export class SearchBatchStrategy implements ISearchStrategy {
  readonly name = 'batch';
  readonly priority = 3;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: SearchContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: SearchContext): Promise<SearchResult<unknown>> {
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
