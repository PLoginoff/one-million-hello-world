/**
 * Saga Analytics
 *
 * Analytics and reporting for saga executions.
 * Provides insights into saga performance and patterns.
 */

import { SagaExecutionEntity } from '../domain/entities/SagaExecution';

export interface AnalyticsReport {
  period: { start: number; end: number };
  totalExecutions: number;
  successRate: number;
  failureRate: number;
  averageDuration: number;
  p50Duration: number;
  p95Duration: number;
  p99Duration: number;
  topFailureReasons: Array<{ reason: string; count: number }>;
  compensationRate: number;
}

export class SagaAnalytics {
  private readonly _executions: SagaExecutionEntity[];

  constructor() {
    this._executions = [];
  }

  /**
   * Add execution for analytics
   */
  addExecution(execution: SagaExecutionEntity): void {
    this._executions.push(execution);
  }

  /**
   * Generate report for time period
   */
  generateReport(startTime: number, endTime: number): AnalyticsReport {
    const filtered = this._executions.filter(
      e => e.metadata.getStartTime() >= startTime && e.metadata.getStartTime() <= endTime
    );

    return {
      period: { start: startTime, end: endTime },
      totalExecutions: filtered.length,
      successRate: this._calculateSuccessRate(filtered),
      failureRate: this._calculateFailureRate(filtered),
      averageDuration: this._calculateAverageDuration(filtered),
      p50Duration: this._calculatePercentile(filtered, 50),
      p95Duration: this._calculatePercentile(filtered, 95),
      p99Duration: this._calculatePercentile(filtered, 99),
      topFailureReasons: this._getTopFailureReasons(filtered),
      compensationRate: this._calculateCompensationRate(filtered),
    };
  }

  /**
   * Get execution trend
   */
  getTrend(period: 'hour' | 'day' | 'week'): Array<{ timestamp: number; count: number }> {
    const trend: Array<{ timestamp: number; count: number }> = [];
    const now = Date.now();
    const periodMs = period === 'hour' ? 60 * 60 * 1000 : period === 'day' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;

    for (let i = 0; i < 24; i++) {
      const start = now - (i + 1) * periodMs;
      const end = now - i * periodMs;
      const count = this._executions.filter(
        e => e.metadata.getStartTime() >= start && e.metadata.getStartTime() < end
      ).length;

      trend.push({ timestamp: start, count });
    }

    return trend.reverse();
  }

  /**
   * Get saga performance comparison
   */
  compareSagaPerformance(sagaId1: string, sagaId2: string): {
    saga1: { avgDuration: number; successRate: number };
    saga2: { avgDuration: number; successRate: number };
  } {
    const exec1 = this._executions.filter(e => e.sagaId === sagaId1);
    const exec2 = this._executions.filter(e => e.sagaId === sagaId2);

    return {
      saga1: {
        avgDuration: this._calculateAverageDuration(exec1),
        successRate: this._calculateSuccessRate(exec1),
      },
      saga2: {
        avgDuration: this._calculateAverageDuration(exec2),
        successRate: this._calculateSuccessRate(exec2),
      },
    };
  }

  /**
   * Clear all executions
   */
  clear(): void {
    this._executions.length = 0;
  }

  private _calculateSuccessRate(executions: SagaExecutionEntity[]): number {
    if (executions.length === 0) return 0;
    const successful = executions.filter(e => e.status === 'completed').length;
    return (successful / executions.length) * 100;
  }

  private _calculateFailureRate(executions: SagaExecutionEntity[]): number {
    if (executions.length === 0) return 0;
    const failed = executions.filter(e => e.status === 'failed').length;
    return (failed / executions.length) * 100;
  }

  private _calculateAverageDuration(executions: SagaExecutionEntity[]): number {
    if (executions.length === 0) return 0;
    const total = executions.reduce((sum, e) => sum + e.getDuration(), 0);
    return total / executions.length;
  }

  private _calculatePercentile(executions: SagaExecutionEntity[], percentile: number): number {
    if (executions.length === 0) return 0;
    const durations = executions.map(e => e.getDuration()).sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * durations.length) - 1;
    return durations[index] || 0;
  }

  private _getTopFailureReasons(executions: SagaExecutionEntity[]): Array<{ reason: string; count: number }> {
    const reasons: Record<string, number> = {};
    const failed = executions.filter(e => e.status === 'failed');

    for (const execution of failed) {
      const reason = execution.metadata.getErrorMessage() || 'Unknown';
      reasons[reason] = (reasons[reason] || 0) + 1;
    }

    return Object.entries(reasons)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  private _calculateCompensationRate(executions: SagaExecutionEntity[]): number {
    if (executions.length === 0) return 0;
    const compensated = executions.filter(e => e.status === 'compensated').length;
    return (compensated / executions.length) * 100;
  }
}
