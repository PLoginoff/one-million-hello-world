/**
 * Saga Metrics Collector
 *
 * Collects and aggregates metrics for saga executions.
 * Provides detailed performance and health metrics.
 */

import { SagaExecutionEntity } from '../../domain/entities/SagaExecution';

export interface SagaMetricsData {
  executionId: string;
  sagaId: string;
  status: string;
  duration: number;
  completedSteps: number;
  failedSteps: number;
  totalSteps: number;
  attemptCount: number;
  compensationSteps: number;
  timestamp: number;
}

export class SagaMetricsCollector {
  private readonly _metrics: SagaMetricsData[];

  constructor() {
    this._metrics = [];
  }

  /**
   * Collect metrics from execution
   */
  collect(execution: SagaExecutionEntity): SagaMetricsData {
    const metrics: SagaMetricsData = {
      executionId: execution.executionId,
      sagaId: execution.sagaId,
      status: execution.status,
      duration: execution.getDuration(),
      completedSteps: execution.getCompletedStepsCount(),
      failedSteps: execution.getFailedStepsCount(),
      totalSteps: execution.steps.length,
      attemptCount: execution.metadata.getAttemptCount(),
      compensationSteps: execution.compensationSteps.length,
      timestamp: Date.now(),
    };

    this._metrics.push(metrics);
    return metrics;
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): SagaMetricsData[] {
    return [...this._metrics];
  }

  /**
   * Get metrics by saga ID
   */
  getMetricsBySagaId(sagaId: string): SagaMetricsData[] {
    return this._metrics.filter(m => m.sagaId === sagaId);
  }

  /**
   * Get metrics by status
   */
  getMetricsByStatus(status: string): SagaMetricsData[] {
    return this._metrics.filter(m => m.status === status);
  }

  /**
   * Get average duration
   */
  getAverageDuration(sagaId?: string): number {
    const metrics = sagaId ? this.getMetricsBySagaId(sagaId) : this._metrics;
    if (metrics.length === 0) {
      return 0;
    }
    const total = metrics.reduce((sum, m) => sum + m.duration, 0);
    return total / metrics.length;
  }

  /**
   * Get success rate
   */
  getSuccessRate(sagaId?: string): number {
    const metrics = sagaId ? this.getMetricsBySagaId(sagaId) : this._metrics;
    if (metrics.length === 0) {
      return 0;
    }
    const successful = metrics.filter(m => m.status === 'completed').length;
    return (successful / metrics.length) * 100;
  }

  /**
   * Get failure rate
   */
  getFailureRate(sagaId?: string): number {
    const metrics = sagaId ? this.getMetricsBySagaId(sagaId) : this._metrics;
    if (metrics.length === 0) {
      return 0;
    }
    const failed = metrics.filter(m => m.status === 'failed').length;
    return (failed / metrics.length) * 100;
  }

  /**
   * Get percentiles
   */
  getPercentiles(percentile: number, sagaId?: string): number {
    const metrics = sagaId ? this.getMetricsBySagaId(sagaId) : this._metrics;
    if (metrics.length === 0) {
      return 0;
    }

    const sorted = [...metrics].sort((a, b) => a.duration - b.duration);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index]?.duration || 0;
  }

  clear(): void {
    this._metrics.length = 0;
  }
}
