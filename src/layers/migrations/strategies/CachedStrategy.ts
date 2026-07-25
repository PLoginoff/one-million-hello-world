/**
 * MigrationsCachedStrategy
 *
 * Caching migrations strategy with in-memory cache.
 */

import { MigrationsContext, MigrationsResult } from '../types/migrations-types';

export interface IMigrationsStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: MigrationsContext): Promise<MigrationsResult<unknown>>;
  canHandle(context: MigrationsContext): boolean;
}

export class MigrationsCachedStrategy implements IMigrationsStrategy {
  readonly name = 'cached';
  readonly priority = 7;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: MigrationsContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: MigrationsContext): Promise<MigrationsResult<unknown>> {
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
