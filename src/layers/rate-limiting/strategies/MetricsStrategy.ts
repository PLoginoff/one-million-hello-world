/**
 * Rate Limiting Metrics Strategy
 *
 * Adds metrics collection to rate limiting operations.
 *
 * @module RateLimitingLayer/Strategies
 */

import { IRateLimitingStrategy } from './DefaultStrategy';
import {
  RateLimitingMetricsCollector,
  RateLimitingMetrics,
  RateLimitingMetricSample,
} from '../metrics/RateLimitingMetricsCollector';
import { RateLimitStatistics } from '../statistics/RateLimitStatistics';
import { RateLimitingErrorFactory } from '../errors';

export interface RateLimitingMetricsStrategyOptions {
  collectLatency: boolean;
  collectErrors: boolean;
  collectThroughput: boolean;
  histogramBuckets: number[];
  sampleRate: number;
}

const DEFAULT_OPTIONS: RateLimitingMetricsStrategyOptions = {
  collectLatency: true,
  collectErrors: true,
  collectThroughput: true,
  histogramBuckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  sampleRate: 1.0,
};

export class RateLimitingMetricsStrategy implements IRateLimitingStrategy {
  readonly name = 'metrics';
  readonly priority = 6;
  private readonly options: RateLimitingMetricsStrategyOptions;
  private readonly wrappedStrategy: IRateLimitingStrategy;
  private readonly metricsCollector: RateLimitingMetricsCollector;
  private _executionCount: number;
  private _latencyHistogram: Map<number, number>;

  constructor(
    wrappedStrategy: IRateLimitingStrategy,
    statistics: RateLimitStatistics,
    options: Partial<RateLimitingMetricsStrategyOptions> = {}
  ) {
    this.wrappedStrategy = wrappedStrategy;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.metricsCollector = new RateLimitingMetricsCollector(statistics);
    this._executionCount = 0;
    this._latencyHistogram = new Map();

    for (const bucket of this.options.histogramBuckets) {
      this._latencyHistogram.set(bucket, 0);
    }
  }

  canHandle(input: unknown): boolean {
    return this.wrappedStrategy.canHandle(input);
  }

  async execute(
    input: unknown
  ): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }> {
    this._executionCount++;
    if (Math.random() > this.options.sampleRate) {
      return this.wrappedStrategy.execute(input);
    }
    const startTime = Date.now();

    try {
      const result = await this.wrappedStrategy.execute(input);
      const duration = Date.now() - startTime;

      this.recordMetrics(result.success, duration, result.error?.code);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.recordMetrics(false, duration, (error as Error).name);
      throw error;
    }
  }

  private recordMetrics(success: boolean, duration: number, errorCode?: string): void {
    if (this.options.collectLatency) {
      this.recordLatency(duration);
    }

    if (this.options.collectErrors && !success) {
      this.recordError(errorCode ?? 'UNKNOWN_ERROR');
    }

    if (this.options.collectThroughput) {
      this.recordThroughput();
    }
  }

  private recordLatency(duration: number): void {
    for (const bucket of this.options.histogramBuckets) {
      if (duration <= bucket) {
        const current = this._latencyHistogram.get(bucket) ?? 0;
        this._latencyHistogram.set(bucket, current + 1);
        break;
      }
    }
    const maxBucket = Math.max(...this.options.histogramBuckets);
    if (duration > maxBucket) {
      const current = this._latencyHistogram.get(maxBucket) ?? 0;
      this._latencyHistogram.set(maxBucket, current + 1);
    }
  }

  private recordError(errorCode: string): void {
    this.metricsCollector.collect();
  }

  private recordThroughput(): void {
    this.metricsCollector.collect();
  }

  getExecutionCount(): number {
    return this._executionCount;
  }

  getWrappedStrategy(): IRateLimitingStrategy {
    return this.wrappedStrategy;
  }

  getMetricsCollector(): RateLimitingMetricsCollector {
    return this.metricsCollector;
  }

  getLatencyHistogram(): Map<number, number> {
    return new Map(this._latencyHistogram);
  }

  getMetrics(): RateLimitingMetrics {
    return this.metricsCollector.collect();
  }

  getPrometheusMetrics(): RateLimitingMetricSample[] {
    return this.metricsCollector.collectAsPrometheusSamples();
  }

  getPrometheusString(): string {
    return this.metricsCollector.toPrometheusString();
  }

  resetHistogram(): void {
    for (const bucket of this.options.histogramBuckets) {
      this._latencyHistogram.set(bucket, 0);
    }
  }

  setSampleRate(rate: number): void {
    this.options.sampleRate = Math.max(0, Math.min(1, rate));
  }
}

export class RateLimitingMetricsStrategyFactory {
  static create(
    wrappedStrategy: IRateLimitingStrategy,
    statistics: RateLimitStatistics,
    options?: Partial<RateLimitingMetricsStrategyOptions>
  ): RateLimitingMetricsStrategy {
    return new RateLimitingMetricsStrategy(wrappedStrategy, statistics, options);
  }

  static createWithDefaults(
    wrappedStrategy: IRateLimitingStrategy,
    statistics: RateLimitStatistics
  ): RateLimitingMetricsStrategy {
    return new RateLimitingMetricsStrategy(wrappedStrategy, statistics);
  }
}
