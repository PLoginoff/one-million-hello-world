/**
 * Middleware Health Check
 */

import { MiddlewareStatistics } from '../statistics/MiddlewareStatistics';

export type MiddlewareHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface MiddlewareHealthCheckResult {
  status: MiddlewareHealthStatus;
  timestamp: number;
  checks: MiddlewareHealthCheckEntry[];
  summary: string;
}

export interface MiddlewareHealthCheckEntry {
  name: string;
  status: MiddlewareHealthStatus;
  message: string;
  details?: Record<string, unknown>;
}

export class MiddlewareHealthCheck {
  private readonly _statistics: MiddlewareStatistics;

  constructor(statistics: MiddlewareStatistics) {
    this._statistics = statistics;
  }

  check(): MiddlewareHealthCheckResult {
    const checks: MiddlewareHealthCheckEntry[] = [];

    checks.push(this._checkExecutionCount());
    checks.push(this._checkSuccessRate());
    checks.push(this._checkAverageExecutionTime());

    const overall = this._aggregateStatus(checks);

    return {
      status: overall,
      timestamp: Date.now(),
      checks,
      summary: `Middleware health: ${overall}`,
    };
  }

  private _checkExecutionCount(): MiddlewareHealthCheckEntry {
    const stats = this._statistics.getStats();
    if (stats.totalExecutions > 0) {
      return { name: 'execution-count', status: 'healthy', message: `${stats.totalExecutions} executions recorded` };
    }
    return { name: 'execution-count', status: 'degraded', message: 'No executions recorded' };
  }

  private _checkSuccessRate(): MiddlewareHealthCheckEntry {
    const stats = this._statistics.getStats();
    const rate = stats.totalExecutions > 0 ? stats.successfulExecutions / stats.totalExecutions : 1.0;
    if (rate >= 0.95) {
      return {
        name: 'success-rate',
        status: 'healthy',
        message: `Success rate: ${(rate * 100).toFixed(2)}%`,
        details: { rate },
      };
    }
    if (rate >= 0.8) {
      return {
        name: 'success-rate',
        status: 'degraded',
        message: `Success rate: ${(rate * 100).toFixed(2)}%`,
        details: { rate },
      };
    }
    return {
      name: 'success-rate',
      status: 'unhealthy',
      message: `Success rate: ${(rate * 100).toFixed(2)}%`,
      details: { rate },
    };
  }

  private _checkAverageExecutionTime(): MiddlewareHealthCheckEntry {
    const stats = this._statistics.getStats();
    const avg = stats.averageExecutionTime;
    if (avg <= 10) {
      return { name: 'avg-execution-time', status: 'healthy', message: `Avg: ${avg.toFixed(2)}ms`, details: { avg } };
    }
    if (avg <= 50) {
      return { name: 'avg-execution-time', status: 'degraded', message: `Avg: ${avg.toFixed(2)}ms`, details: { avg } };
    }
    return { name: 'avg-execution-time', status: 'unhealthy', message: `Avg: ${avg.toFixed(2)}ms`, details: { avg } };
  }

  private _aggregateStatus(checks: MiddlewareHealthCheckEntry[]): MiddlewareHealthStatus {
    if (checks.some((c) => c.status === 'unhealthy')) return 'unhealthy';
    if (checks.some((c) => c.status === 'degraded')) return 'degraded';
    return 'healthy';
  }
}
