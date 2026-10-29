/**
 * Security Metrics Strategy
 *
 * Adds metrics collection to security operations.
 *
 * @module SecurityLayer/Strategies
 */

import { ISecurityStrategy } from './DefaultStrategy';
import { SecurityMetricsCollector, SecurityMetrics, SecurityMetricSample } from '../metrics/SecurityMetricsCollector';
import { SecurityStatistics } from '../statistics/SecurityStatistics';
import { SecurityErrorFactory } from '../errors';

export interface SecurityMetricsStrategyOptions {
  collectLatency: boolean;
  collectErrors: boolean;
  collectThroughput: boolean;
  histogramBuckets: number[];
  sampleRate: number;
}

const DEFAULT_OPTIONS: SecurityMetricsStrategyOptions = {
  collectLatency: true,
  collectErrors: true,
  collectThroughput: true,
  histogramBuckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  sampleRate: 1.0,
};

export class SecurityMetricsStrategy implements ISecurityStrategy {
  readonly name = 'metrics';
  readonly priority = 6;
  private readonly options: SecurityMetricsStrategyOptions;
  private readonly wrappedStrategy: ISecurityStrategy;
  private readonly metricsCollector: SecurityMetricsCollector;
  private _executionCount: number;
  private _latencyHistogram: Map<number, number>;

  constructor(
    wrappedStrategy: ISecurityStrategy,
    statistics: SecurityStatistics,
    options: Partial<SecurityMetricsStrategyOptions> = {}
  ) {
    this.wrappedStrategy = wrappedStrategy;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.metricsCollector = new SecurityMetricsCollector(statistics);
    this._executionCount = 0;
    this._latencyHistogram = new Map();

    // Initialize histogram buckets
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
    // Check sample rate
    if (Math.random() > this.options.sampleRate) {
      return this.wrappedStrategy.execute(input);
    }
    const startTime = Date.now();

    try {
      const result = await this.wrappedStrategy.execute(input);
      const duration = Date.now() - startTime;

      // Record metrics
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
    // Find the appropriate bucket
    for (const bucket of this.options.histogramBuckets) {
      if (duration <= bucket) {
        const current = this._latencyHistogram.get(bucket) ?? 0;
        this._latencyHistogram.set(bucket, current + 1);
        break;
      }
    }
    // If duration exceeds all buckets, record in the largest bucket
    const maxBucket = Math.max(...this.options.histogramBuckets);
    if (duration > maxBucket) {
      const current = this._latencyHistogram.get(maxBucket) ?? 0;
      this._latencyHistogram.set(maxBucket, current + 1);
    }
  }

  private recordError(errorCode: string): void {
    // Errors are tracked via the metrics collector
    this.metricsCollector.collect();
  }

  private recordThroughput(): void {
    // Throughput is tracked via the metrics collector
    this.metricsCollector.collect();
  }

  getExecutionCount(): number {
    return this._executionCount;
  }

  getWrappedStrategy(): ISecurityStrategy {
    return this.wrappedStrategy;
  }

  getMetricsCollector(): SecurityMetricsCollector {
    return this.metricsCollector;
  }

  getLatencyHistogram(): Map<number, number> {
    return new Map(this._latencyHistogram);
  }

  getMetrics(): SecurityMetrics {
    return this.metricsCollector.collect();
  }

  getPrometheusMetrics(): SecurityMetricSample[] {
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

/**
 * Factory for creating metrics strategy
 */
export class SecurityMetricsStrategyFactory {
  static create(
    wrappedStrategy: ISecurityStrategy,
    statistics: SecurityStatistics,
    options?: Partial<SecurityMetricsStrategyOptions>
  ): SecurityMetricsStrategy {
    return new SecurityMetricsStrategy(wrappedStrategy, statistics, options);
  }

  static createWithDefaults(
    wrappedStrategy: ISecurityStrategy,
    statistics: SecurityStatistics
  ): SecurityMetricsStrategy {
    return new SecurityMetricsStrategy(wrappedStrategy, statistics);
  }
}
