/**
 * HTTP Parser Metrics Strategy
 *
 * Adds metrics collection to HTTP parser operations by wrapping a base strategy.
 * Collects latency, error rates, and throughput metrics with histogram support.
 *
 * @module HttpParserLayer/Strategies
 */

import { IHttpParserStrategy, HttpParserStrategyContext, StrategyResult } from './IHttpParserStrategy';
import {
  HttpParserPrometheusMetricsCollector,
  HttpParserPrometheusMetrics,
  HttpParserMetricSample,
} from '../metrics/HttpParserPrometheusMetricsCollector';
import { HttpParserMetricsCollector } from '../statistics/HttpParserMetricsCollector';
import { HttpParserErrorFactory } from '../errors';

/**
 * Configuration options for the metrics strategy.
 */
export interface MetricsHttpParserStrategyOptions {
  /** Whether to collect latency metrics */
  collectLatency: boolean;
  /** Whether to collect error metrics */
  collectErrors: boolean;
  /** Whether to collect throughput metrics */
  collectThroughput: boolean;
  /** Histogram bucket boundaries in milliseconds */
  histogramBuckets: number[];
  /** Sampling rate (0.0 to 1.0) */
  sampleRate: number;
}

const DEFAULT_OPTIONS: MetricsHttpParserStrategyOptions = {
  collectLatency: true,
  collectErrors: true,
  collectThroughput: true,
  histogramBuckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  sampleRate: 1.0,
};

/**
 * Metrics HTTP parser strategy that wraps a base strategy and collects metrics.
 */
export class MetricsHttpParserStrategy implements IHttpParserStrategy {
  /** Unique name identifying this strategy */
  readonly name = 'metrics-http-parser';

  /** Priority for strategy selection (higher = preferred) */
  readonly priority = 6;

  private readonly options: MetricsHttpParserStrategyOptions;
  private readonly wrappedStrategy: IHttpParserStrategy;
  private readonly metricsCollector: HttpParserPrometheusMetricsCollector;
  private executionCount: number;
  private latencyHistogram: Map<number, number>;

  /**
   * Creates a new MetricsHttpParserStrategy instance.
   *
   * @param wrappedStrategy - The base strategy to wrap with metrics
   * @param collector - The metrics collector instance for metrics collection
   * @param options - Optional configuration options
   */
  constructor(
    wrappedStrategy: IHttpParserStrategy,
    collector: HttpParserMetricsCollector,
    options: Partial<MetricsHttpParserStrategyOptions> = {}
  ) {
    this.wrappedStrategy = wrappedStrategy;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.metricsCollector = new HttpParserPrometheusMetricsCollector(collector);
    this.executionCount = 0;
    this.latencyHistogram = new Map();

    // Initialize histogram buckets
    for (const bucket of this.options.histogramBuckets) {
      this.latencyHistogram.set(bucket, 0);
    }
  }

  /**
   * Determines if the wrapped strategy can handle the given context.
   *
   * @param context - The strategy context to evaluate
   * @returns True if the wrapped strategy can handle the context
   */
  canHandle(context: HttpParserStrategyContext): boolean {
    return this.wrappedStrategy.canHandle(context);
  }

  /**
   * Executes the wrapped strategy with metrics collection.
   *
   * @param context - The strategy context containing input and metadata
   * @returns Promise resolving to the strategy result
   */
  async execute(context: HttpParserStrategyContext): Promise<StrategyResult> {
    // Check sample rate
    if (Math.random() > this.options.sampleRate) {
      return this.wrappedStrategy.execute(context);
    }

    this.executionCount++;
    const startTime = Date.now();

    try {
      const result = await this.wrappedStrategy.execute(context);
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

  /**
   * Records metrics based on execution outcome.
   *
   * @param success - Whether the execution was successful
   * @param duration - Execution duration in milliseconds
   * @param errorCode - Optional error code
   */
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

  /**
   * Records latency in the histogram.
   *
   * @param duration - Execution duration in milliseconds
   */
  private recordLatency(duration: number): void {
    // Find the appropriate bucket
    for (const bucket of this.options.histogramBuckets) {
      if (duration <= bucket) {
        const current = this.latencyHistogram.get(bucket) ?? 0;
        this.latencyHistogram.set(bucket, current + 1);
        break;
      }
    }
    // If duration exceeds all buckets, record in the largest bucket
    const maxBucket = Math.max(...this.options.histogramBuckets);
    if (duration > maxBucket) {
      const current = this.latencyHistogram.get(maxBucket) ?? 0;
      this.latencyHistogram.set(maxBucket, current + 1);
    }
  }

  /**
   * Records an error occurrence.
   *
   * @param errorCode - The error code
   */
  private recordError(errorCode: string): void {
    // Errors are tracked via the metrics collector
    this.metricsCollector.collect();
  }

  /**
   * Records a throughput event.
   */
  private recordThroughput(): void {
    // Throughput is tracked via the metrics collector
    this.metricsCollector.collect();
  }

  /**
   * Gets the number of times this strategy has been executed.
   *
   * @returns The execution count
   */
  getExecutionCount(): number {
    return this.executionCount;
  }

  /**
   * Gets the wrapped strategy.
   *
   * @returns The wrapped strategy instance
   */
  getWrappedStrategy(): IHttpParserStrategy {
    return this.wrappedStrategy;
  }

  /**
   * Gets the metrics collector.
   *
   * @returns The metrics collector instance
   */
  getMetricsCollector(): HttpParserPrometheusMetricsCollector {
    return this.metricsCollector;
  }

  /**
   * Gets a copy of the latency histogram.
   *
   * @returns Map of bucket boundaries to counts
   */
  getLatencyHistogram(): Map<number, number> {
    return new Map(this.latencyHistogram);
  }

  /**
   * Gets the current metrics snapshot.
   *
   * @returns The collected metrics
   */
  getMetrics(): HttpParserPrometheusMetrics {
    return this.metricsCollector.collect();
  }

  /**
   * Gets metrics in Prometheus format.
   *
   * @returns Array of Prometheus metric samples
   */
  getPrometheusMetrics(): HttpParserMetricSample[] {
    return this.metricsCollector.collectAsPrometheusSamples();
  }

  /**
   * Gets metrics as a Prometheus-formatted string.
   *
   * @returns Prometheus metrics string
   */
  getPrometheusString(): string {
    return this.metricsCollector.toPrometheusString();
  }

  /**
   * Resets the latency histogram to zero.
   */
  resetHistogram(): void {
    for (const bucket of this.options.histogramBuckets) {
      this.latencyHistogram.set(bucket, 0);
    }
  }

  /**
   * Sets the sampling rate.
   *
   * @param rate - The sampling rate (0.0 to 1.0)
   */
  setSampleRate(rate: number): void {
    this.options.sampleRate = Math.max(0, Math.min(1, rate));
  }
}

/**
 * Factory for creating metrics strategy instances.
 */
export class MetricsHttpParserStrategyFactory {
  /**
   * Creates a new metrics strategy with the given wrapped strategy, collector, and options.
   *
   * @param wrappedStrategy - The base strategy to wrap
   * @param collector - The metrics collector instance for metrics collection
   * @param options - Optional configuration options
   * @returns A new MetricsHttpParserStrategy instance
   */
  static create(
    wrappedStrategy: IHttpParserStrategy,
    collector: HttpParserMetricsCollector,
    options?: Partial<MetricsHttpParserStrategyOptions>
  ): MetricsHttpParserStrategy {
    return new MetricsHttpParserStrategy(wrappedStrategy, collector, options);
  }

  /**
   * Creates a new metrics strategy with default options.
   *
   * @param wrappedStrategy - The base strategy to wrap
   * @param collector - The metrics collector instance for metrics collection
   * @returns A new MetricsHttpParserStrategy instance
   */
  static createWithDefaults(
    wrappedStrategy: IHttpParserStrategy,
    collector: HttpParserMetricsCollector
  ): MetricsHttpParserStrategy {
    return new MetricsHttpParserStrategy(wrappedStrategy, collector);
  }
}
