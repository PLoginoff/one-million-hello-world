/**
 * AnomalyDetectionFastStrategy
 *
 * High-performance anomalyDetection strategy optimized for speed.
 */

import { AnomalyDetectionContext, AnomalyDetectionResult } from '../types/anomaly-detection-types';

export interface IAnomalyDetectionStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: AnomalyDetectionContext): Promise<AnomalyDetectionResult<unknown>>;
  canHandle(context: AnomalyDetectionContext): boolean;
}

export class AnomalyDetectionFastStrategy implements IAnomalyDetectionStrategy {
  readonly name = 'fast';
  readonly priority = 10;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: AnomalyDetectionContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: AnomalyDetectionContext): Promise<AnomalyDetectionResult<unknown>> {
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
