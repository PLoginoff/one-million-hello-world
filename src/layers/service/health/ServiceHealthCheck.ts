/**
 * Service Health Check
 *
 * Provides health check functionality for the service layer.
 */

import { ServiceStatistics } from '../statistics/ServiceStatistics';

export type ServiceHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface ServiceHealthCheckResult {
  status: ServiceHealthStatus;
  timestamp: number;
  checks: ServiceHealthCheckEntry[];
  summary: string;
}

export interface ServiceHealthCheckEntry {
  name: string;
  status: ServiceHealthStatus;
  message: string;
  details?: Record<string, unknown>;
}

export class ServiceHealthCheck {
  private readonly _statistics: ServiceStatistics;

  constructor(statistics: ServiceStatistics) {
    this._statistics = statistics;
  }

  check(): ServiceHealthCheckResult {
    const checks: ServiceHealthCheckEntry[] = [];

    checks.push(this._checkExecutionCount());
    checks.push(this._checkSuccessRate());
    checks.push(this._checkAverageExecutionTime());

    const overall = this._aggregateStatus(checks);

    return {
      status: overall,
      timestamp: Date.now(),
      checks,
      summary: `Service health: ${overall}`,
    };
  }

  private _checkExecutionCount(): ServiceHealthCheckEntry {
    const stats = this._statistics.getStats();
    if (stats.totalExecutions > 0) {
      return {
        name: 'execution-count',
        status: 'healthy',
        message: `${stats.totalExecutions} executions recorded`,
      };
    }
    return {
      name: 'execution-count',
      status: 'degraded',
      message: 'No executions recorded',
    };
  }

  private _checkSuccessRate(): ServiceHealthCheckEntry {
    const rate = this._statistics.getSuccessRate();
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

  private _checkAverageExecutionTime(): ServiceHealthCheckEntry {
    const stats = this._statistics.getStats();
    const avg = stats.averageExecutionTime;
    if (avg <= 100) {
      return { name: 'avg-execution-time', status: 'healthy', message: `Avg: ${avg.toFixed(2)}ms`, details: { avg } };
    }
    if (avg <= 500) {
      return { name: 'avg-execution-time', status: 'degraded', message: `Avg: ${avg.toFixed(2)}ms`, details: { avg } };
    }
    return { name: 'avg-execution-time', status: 'unhealthy', message: `Avg: ${avg.toFixed(2)}ms`, details: { avg } };
  }

  private _aggregateStatus(checks: ServiceHealthCheckEntry[]): ServiceHealthStatus {
    if (checks.some((c) => c.status === 'unhealthy')) return 'unhealthy';
    if (checks.some((c) => c.status === 'degraded')) return 'degraded';
    return 'healthy';
  }
}
