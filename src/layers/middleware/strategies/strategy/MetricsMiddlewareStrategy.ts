/**
 * Metrics Middleware Strategy
 */

import { IMiddlewareStrategy } from './IMiddlewareStrategy';
import { MiddlewareContextEntity } from '../../domain/entities/MiddlewareContextEntity';

export interface MiddlewareMetricsData {
  totalRequests: number;
  totalDurationMs: number;
  averageDurationMs: number;
  byTimestamp: Map<number, number>;
}

export class MetricsMiddlewareStrategy implements IMiddlewareStrategy {
  private _metrics: MiddlewareMetricsData;

  constructor() {
    this._metrics = {
      totalRequests: 0,
      totalDurationMs: 0,
      averageDurationMs: 0,
      byTimestamp: new Map(),
    };
  }

  getName(): string {
    return 'METRICS';
  }

  async execute(context: MiddlewareContextEntity): Promise<MiddlewareContextEntity> {
    const start = Date.now();

    const updated = context.setMetadata('metricsStartTime', start);

    const elapsed = Date.now() - start;
    this._metrics.totalRequests++;
    this._metrics.totalDurationMs += elapsed;
    this._metrics.averageDurationMs = this._metrics.totalDurationMs / this._metrics.totalRequests;

    const count = this._metrics.byTimestamp.get(context.data.timestamp) ?? 0;
    this._metrics.byTimestamp.set(context.data.timestamp, count + 1);

    return Promise.resolve(updated);
  }

  getMetrics(): MiddlewareMetricsData {
    return {
      totalRequests: this._metrics.totalRequests,
      totalDurationMs: this._metrics.totalDurationMs,
      averageDurationMs: this._metrics.averageDurationMs,
      byTimestamp: new Map(this._metrics.byTimestamp),
    };
  }

  reset(): void {
    this._metrics = {
      totalRequests: 0,
      totalDurationMs: 0,
      averageDurationMs: 0,
      byTimestamp: new Map(),
    };
  }
}
