/**
 * Repository Health Check
 *
 * Provides health check functionality for the repository layer.
 */

import { RepositoryStatistics } from '../statistics/RepositoryStatistics';

export type RepositoryHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface RepositoryHealthCheckResult {
  status: RepositoryHealthStatus;
  timestamp: number;
  checks: RepositoryHealthCheckEntry[];
  summary: string;
}

export interface RepositoryHealthCheckEntry {
  name: string;
  status: RepositoryHealthStatus;
  message: string;
  details?: Record<string, unknown>;
}

export class RepositoryHealthCheck {
  private readonly _statistics: RepositoryStatistics;

  constructor(statistics: RepositoryStatistics) {
    this._statistics = statistics;
  }

  check(): RepositoryHealthCheckResult {
    const checks: RepositoryHealthCheckEntry[] = [];

    checks.push(this._checkQueryCount());
    checks.push(this._checkSuccessRate());
    checks.push(this._checkAverageQueryTime());

    const overall = this._aggregateStatus(checks);

    return {
      status: overall,
      timestamp: Date.now(),
      checks,
      summary: `Repository health: ${overall}`,
    };
  }

  private _checkQueryCount(): RepositoryHealthCheckEntry {
    const stats = this._statistics.getStats();
    if (stats.totalQueries > 0) {
      return { name: 'query-count', status: 'healthy', message: `${stats.totalQueries} queries recorded` };
    }
    return { name: 'query-count', status: 'degraded', message: 'No queries recorded' };
  }

  private _checkSuccessRate(): RepositoryHealthCheckEntry {
    const stats = this._statistics.getStats();
    const rate = stats.totalQueries > 0 ? stats.successfulQueries / stats.totalQueries : 1.0;
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

  private _checkAverageQueryTime(): RepositoryHealthCheckEntry {
    const stats = this._statistics.getStats();
    const avg = stats.averageQueryTime;
    if (avg <= 50) {
      return { name: 'avg-query-time', status: 'healthy', message: `Avg: ${avg.toFixed(2)}ms`, details: { avg } };
    }
    if (avg <= 200) {
      return { name: 'avg-query-time', status: 'degraded', message: `Avg: ${avg.toFixed(2)}ms`, details: { avg } };
    }
    return { name: 'avg-query-time', status: 'unhealthy', message: `Avg: ${avg.toFixed(2)}ms`, details: { avg } };
  }

  private _aggregateStatus(checks: RepositoryHealthCheckEntry[]): RepositoryHealthStatus {
    if (checks.some((c) => c.status === 'unhealthy')) return 'unhealthy';
    if (checks.some((c) => c.status === 'degraded')) return 'degraded';
    return 'healthy';
  }
}
