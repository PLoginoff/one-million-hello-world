/**
 * MessageQueueCachedStrategy
 *
 * Cached strategy for message queue operations with result caching.
 */

import { MessageQueueStrategyContext, MessageQueueStrategyResult, IMessageQueueStrategy } from '../types/message-queue-types';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export class MessageQueueCachedStrategy implements IMessageQueueStrategy {
  readonly name = 'cached';
  readonly priority = 15;
  private _executionCount: number;
  private _successCount: number;
  private _failureCount: number;
  private _totalExecutionTime: number;
  private _cache: Map<string, CacheEntry<MessageQueueStrategyResult>>;
  private _defaultTtl: number;
  private _maxCacheSize: number;

  constructor(defaultTtl: number = 60000, maxCacheSize: number = 1000) {
    this._executionCount = 0;
    this._successCount = 0;
    this._failureCount = 0;
    this._totalExecutionTime = 0;
    this._cache = new Map();
    this._defaultTtl = defaultTtl;
    this._maxCacheSize = maxCacheSize;
  }

  canHandle(context: MessageQueueStrategyContext): boolean {
    return context !== null && context !== undefined && context.operation !== undefined;
  }

  async execute(context: MessageQueueStrategyContext): Promise<MessageQueueStrategyResult> {
    const startTime = Date.now();
    this._executionCount++;

    // Generate cache key
    const cacheKey = this._generateCacheKey(context);

    // Check cache
    const cached = this._getFromCache(cacheKey);
    if (cached) {
      this._successCount++;
      return {
        ...cached,
        metadata: {
          ...cached.metadata,
          cacheHit: true,
          cacheKey,
        },
      };
    }

    try {
      // Process the operation
      const result = await this._processOperation(context);

      const executionTime = Date.now() - startTime;
      this._successCount++;
      this._totalExecutionTime += executionTime;

      const finalResult: MessageQueueStrategyResult = {
        ...result,
        metadata: {
          ...result.metadata,
          executionTimeMs: executionTime,
          timestamp: Date.now(),
          cacheHit: false,
          cacheKey,
        },
      };

      // Cache successful results
      if (finalResult.success) {
        this._setCache(cacheKey, finalResult);
      }

      return finalResult;
    } catch (error) {
      this._failureCount++;
      return {
        success: false,
        error: {
          code: 'EXECUTION_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          executionTimeMs: Date.now() - startTime,
          timestamp: Date.now(),
          cacheHit: false,
          cacheKey,
        },
      };
    }
  }

  private async _processOperation(context: MessageQueueStrategyContext): Promise<MessageQueueStrategyResult> {
    // Simulate processing
    await Promise.resolve();

    return {
      success: true,
      data: {
        strategy: this.name,
        operation: context.operation,
        executionCount: this._executionCount,
        queueSize: context.queueSize,
      },
      metadata: {
        timestamp: Date.now(),
      },
    };
  }

  private _generateCacheKey(context: MessageQueueStrategyContext): string {
    const messageId = context.message?.id ?? 'no-message';
    return `${context.operation}:${messageId}:${context.queueSize}`;
  }

  private _getFromCache(key: string): MessageQueueStrategyResult | null {
    const entry = this._cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this._cache.delete(key);
      return null;
    }

    return entry.data;
  }

  private _setCache(key: string, data: MessageQueueStrategyResult): void {
    // Evict oldest if at max size
    if (this._cache.size >= this._maxCacheSize) {
      const firstKey = this._cache.keys().next().value;
      if (firstKey) {
        this._cache.delete(firstKey);
      }
    }

    this._cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: this._defaultTtl,
    });
  }

  getExecutionCount(): number {
    return this._executionCount;
  }

  getSuccessCount(): number {
    return this._successCount;
  }

  getFailureCount(): number {
    return this._failureCount;
  }

  getAverageExecutionTime(): number {
    return this._executionCount > 0 ? this._totalExecutionTime / this._executionCount : 0;
  }

  getCacheSize(): number {
    return this._cache.size;
  }

  getCacheHitRate(): number {
    // This would need hit/miss tracking
    return 0;
  }

  getMetrics() {
    return {
      executionCount: this._executionCount,
      successCount: this._successCount,
      failureCount: this._failureCount,
      averageExecutionTime: this.getAverageExecutionTime(),
      cacheSize: this._cache.size,
      cacheMaxSize: this._maxCacheSize,
    };
  }

  clearCache(): void {
    this._cache.clear();
  }

  setDefaultTtl(ttl: number): void {
    this._defaultTtl = ttl;
  }

  setMaxCacheSize(size: number): void {
    this._maxCacheSize = size;
  }

  reset(): void {
    this._executionCount = 0;
    this._successCount = 0;
    this._failureCount = 0;
    this._totalExecutionTime = 0;
    this._cache.clear();
  }
}