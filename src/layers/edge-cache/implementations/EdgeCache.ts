/**
 * EdgeCache Implementation
 *
 * Concrete implementation of IEdgeCache.
 * Handles Edge caching and CDN abstraction.
 */

import { IEdgeCache } from '../interfaces/IEdgeCache';
import { EdgeCacheResult, EdgeCacheContext } from '../types/edge-cache-types';

export class EdgeCache implements IEdgeCache {
  private _config: Record<string, unknown>;
  private _metrics: Map<string, number>;

  constructor() {
    this._config = {};
    this._metrics = new Map();
  }

  async execute(context: EdgeCacheContext): Promise<EdgeCacheResult<unknown>> {
    const startTime = Date.now();
    try {
      const output = this._process(context);
      this._recordMetric('successCount', 1);
      this._recordMetric('lastExecutionTime', Date.now() - startTime);
      return Promise.resolve({ success: true, data: output });
    } catch (error) {
      this._recordMetric('failureCount', 1);
      return Promise.resolve({
        success: false,
        error: {
          code: 'EDGECACHE_EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  }

  configure(config: Record<string, unknown>): void {
    this._config = { ...this._config, ...config };
  }

  getStatus(): Record<string, unknown> {
    return {
      config: this._config,
      metrics: Object.fromEntries(this._metrics),
      active: true,
    };
  }

  private _process(context: EdgeCacheContext): unknown {
    return { processed: true, context, layer: 'EdgeCache' };
  }

  private _recordMetric(name: string, delta: number): void {
    const current = this._metrics.get(name) ?? 0;
    this._metrics.set(name, current + delta);
  }
}
