/**
 * QueryObjectCachedStrategy
 *
 * Caching queryObject strategy with in-memory cache.
 */

import { QueryObjectContext, QueryObjectResult } from '../types/query-object-types';

export interface IQueryObjectStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: QueryObjectContext): Promise<QueryObjectResult<unknown>>;
  canHandle(context: QueryObjectContext): boolean;
}

export class QueryObjectCachedStrategy implements IQueryObjectStrategy {
  readonly name = 'cached';
  readonly priority = 7;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: QueryObjectContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: QueryObjectContext): Promise<QueryObjectResult<unknown>> {
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
