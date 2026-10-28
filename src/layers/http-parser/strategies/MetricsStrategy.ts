/**
 * HTTP Parser Metrics Strategy
 *
 * Adds metrics collection to HTTP parser operations.
 *
 * @module HttpParserLayer/Strategies
 */

import { IHttpParserStrategy } from './DefaultStrategy';
import {
  HttpParserPrometheusMetricsCollector,
  HttpParserPrometheusMetrics,
  HttpParserMetricSample,
} from '../metrics/HttpParserPrometheusMetricsCollector';
import { HttpParserMetricsCollector } from '../statistics/HttpParserMetricsCollector';
import { HttpParserErrorFactory } from '../errors';

export interface HttpParserMetricsStrategyOptions {
  collectLatency: boolean;
  collectErrors: boolean;
  collectThroughput: boolean;
  histogramBuckets: number[];
  sampleRate: number;
}

const DEFAULT_OPTIONS: HttpParserMetricsStrategyOptions = {
  collectLatency: true,
  collectErrors: true,
  collectThroughput: true,
  histogramBuckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  sampleRate: 1.0,
};

export class HttpParserMetricsStrategy implements IHttpParserStrategy {
  readonly name = 'metrics';
  readonly priority = 6;
  private readonly options: HttpParserMetricsStrategyOptions;
  private readonly wrappedStrategy: IHttpParserStrategy;
  private readonly metricsCollector: HttpParserPrometheusMetricsCollector;
  private _executionCount: number;
  private _latencyHistogram: Map<number, number>;

  constructor(
    wrappedStrategy: IHttpParserStrategy,
    collector: HttpParserMetricsCollector,
    options: Partial<HttpParserMetricsStrategyOptions> = {}
  ) {
    this.wrappedStrategy = wrappedStrategy;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.metricsCollector = new HttpParserPrometheusMetricsCollector(collector);
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
    if (Math.random() > this.options.sampleRate) {
      return this.wrappedStrategy.execute(input);
    }

    this._executionCount++;
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

  getWrappedStrategy(): IHttpParserStrategy {
    return this.wrappedStrategy;
  }

  getMetricsCollector(): HttpParserPrometheusMetricsCollector {
    return this.metricsCollector;
  }

  getLatencyHistogram(): Map<number, number> {
    return new Map(this._latencyHistogram);
  }

  getMetrics(): HttpParserPrometheusMetrics {
    return this.metricsCollector.collect();
  }

  getPrometheusMetrics(): HttpParserMetricSample[] {
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

export class HttpParserMetricsStrategyFactory {
  static create(
    wrappedStrategy: IHttpParserStrategy,
    collector: HttpParserMetricsCollector,
    options?: Partial<HttpParserMetricsStrategyOptions>
  ): HttpParserMetricsStrategy {
    return new HttpParserMetricsStrategy(wrappedStrategy, collector, options);
  }

  static createWithDefaults(
    wrappedStrategy: IHttpParserStrategy,
    collector: HttpParserMetricsCollector
  ): HttpParserMetricsStrategy {
    return new HttpParserMetricsStrategy(wrappedStrategy, collector);
  }
}
