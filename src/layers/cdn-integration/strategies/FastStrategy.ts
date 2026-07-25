/**
 * CdnIntegrationFastStrategy
 *
 * High-performance cdnIntegration strategy optimized for speed.
 */

import { CdnIntegrationContext, CdnIntegrationResult } from '../types/cdn-integration-types';

export interface ICdnIntegrationStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: CdnIntegrationContext): Promise<CdnIntegrationResult<unknown>>;
  canHandle(context: CdnIntegrationContext): boolean;
}

export class CdnIntegrationFastStrategy implements ICdnIntegrationStrategy {
  readonly name = 'fast';
  readonly priority = 10;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: CdnIntegrationContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: CdnIntegrationContext): Promise<CdnIntegrationResult<unknown>> {
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
