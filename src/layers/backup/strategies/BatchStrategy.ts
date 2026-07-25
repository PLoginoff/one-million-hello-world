/**
 * BackupBatchStrategy
 *
 * Batch-oriented backup strategy for bulk operations.
 */

import { BackupContext, BackupResult } from '../types/backup-types';

export interface IBackupStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: BackupContext): Promise<BackupResult<unknown>>;
  canHandle(context: BackupContext): boolean;
}

export class BackupBatchStrategy implements IBackupStrategy {
  readonly name = 'batch';
  readonly priority = 3;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: BackupContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: BackupContext): Promise<BackupResult<unknown>> {
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
