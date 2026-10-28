/**
 * Metrics Domain Strategy
 *
 * Decorates a domain strategy with metrics collection for each execution.
 * Tracks execution counts, success/failure rates, and latency distributions.
 *
 * @module DomainLayer/Strategies
 */

import { IDomainStrategy } from './IDomainStrategy';
import { DomainContext } from '../types/domain-types';
import { DomainResult } from '../types/domain-types';

/**
 * Snapshot of collected metrics for a domain strategy.
 */
export interface StrategyMetricsSnapshot {
  /** Total number of executions */
  totalExecutions: number;
  /** Number of successful executions */
  successfulExecutions: number;
  /** Number of failed executions */
  failedExecutions: number;
  /** Average execution time in milliseconds */
  averageExecutionTimeMs: number;
  /** Minimum execution time in milliseconds */
  minExecutionTimeMs: number;
  /** Maximum execution time in milliseconds */
  maxExecutionTimeMs: number;
  /** Execution time percentiles (p50, p95, p99) */
  percentiles: {
    p50: number;
    p95: number;
    p99: number;
  };
}

/**
 * Metrics domain strategy that wraps another strategy with metrics collection.
 */
export class MetricsDomainStrategy<TInput = unknown, TOutput = unknown> implements IDomainStrategy<TInput, TOutput> {
  private readonly _inner: IDomainStrategy<TInput, TOutput>;
  private _totalExecutions: number;
  private _successfulExecutions: number;
  private _failedExecutions: number;
  private _executionTimes: number[];
  private readonly _maxSamples: number;

  /**
   * Creates a new MetricsDomainStrategy instance.
   *
   * @param inner - The strategy to wrap with metrics collection
   * @param maxSamples - Maximum number of execution time samples to retain (default: 1000)
   */
  constructor(inner: IDomainStrategy<TInput, TOutput>, maxSamples: number = 1000) {
    this._inner = inner;
    this._totalExecutions = 0;
    this._successfulExecutions = 0;
    this._failedExecutions = 0;
    this._executionTimes = [];
    this._maxSamples = maxSamples;
  }

  /**
   * Gets the strategy name, including the wrapped strategy name.
   *
   * @returns The combined strategy name
   */
  getName(): string {
    return `METRICS(${this._inner.getName()})`;
  }

  /**
   * Gets the strategy priority from the wrapped strategy.
   *
   * @returns The wrapped strategy's priority
   */
  getPriority(): number {
    return this._inner.getPriority();
  }

  /**
   * Executes the wrapped strategy with metrics collection.
   *
   * @param input - The input data for the domain operation
   * @param context - The domain execution context
   * @returns Promise resolving to the domain result
   */
  async execute(input: TInput, context: DomainContext): Promise<DomainResult<TOutput>> {
    const startTime = Date.now();
    this._totalExecutions++;

    try {
      const result = await this._inner.execute(input, context);
      const elapsedMs = Date.now() - startTime;

      this._successfulExecutions++;
      this._recordExecutionTime(elapsedMs);

      return result;
    } catch (error) {
      const elapsedMs = Date.now() - startTime;
      this._failedExecutions++;
      this._recordExecutionTime(elapsedMs);
      throw error;
    }
  }

  /**
   * Records an execution time sample.
   *
   * @param elapsedMs - The execution time in milliseconds
   */
  private _recordExecutionTime(elapsedMs: number): void {
    this._executionTimes.push(elapsedMs);
    if (this._executionTimes.length > this._maxSamples) {
      this._executionTimes.shift();
    }
  }

  /**
   * Calculates a percentile from the recorded execution times.
   *
   * @param percentile - The percentile to calculate (0-100)
   * @returns The percentile value in milliseconds
   */
  private _calculatePercentile(percentile: number): number {
    if (this._executionTimes.length === 0) {
      return 0;
    }

    const sorted = [...this._executionTimes].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Gets a snapshot of the current metrics.
   *
   * @returns The metrics snapshot
   */
  getMetrics(): StrategyMetricsSnapshot {
    const times = this._executionTimes;
    const count = times.length;

    if (count === 0) {
      return {
        totalExecutions: this._totalExecutions,
        successfulExecutions: this._successfulExecutions,
        failedExecutions: this._failedExecutions,
        averageExecutionTimeMs: 0,
        minExecutionTimeMs: 0,
        maxExecutionTimeMs: 0,
        percentiles: { p50: 0, p95: 0, p99: 0 },
      };
    }

    const sum = times.reduce((acc, t) => acc + t, 0);
    const min = Math.min(...times);
    const max = Math.max(...times);

    return {
      totalExecutions: this._totalExecutions,
      successfulExecutions: this._successfulExecutions,
      failedExecutions: this._failedExecutions,
      averageExecutionTimeMs: sum / count,
      minExecutionTimeMs: min,
      maxExecutionTimeMs: max,
      percentiles: {
        p50: this._calculatePercentile(50),
        p95: this._calculatePercentile(95),
        p99: this._calculatePercentile(99),
      },
    };
  }

  /**
   * Resets all collected metrics.
   */
  reset(): void {
    this._totalExecutions = 0;
    this._successfulExecutions = 0;
    this._failedExecutions = 0;
    this._executionTimes = [];
  }
}
