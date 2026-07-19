/**
 * Router Health Check
 */

import { RouterStatistics } from '../statistics/RouterStatistics';

export type RouterHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface RouterHealthCheckResult {
  status: RouterHealthStatus;
  timestamp: number;
  checks: RouterHealthCheckEntry[];
  summary: string;
}

export interface RouterHealthCheckEntry {
  name: string;
  status: RouterHealthStatus;
  message: string;
  details?: Record<string, unknown>;
}

export class RouterHealthCheck {
  private readonly _statistics: RouterStatistics;

  constructor(statistics: RouterStatistics) {
    this._statistics = statistics;
  }

  check(): RouterHealthCheckResult {
    const checks: RouterHealthCheckEntry[] = [];

    checks.push(this._checkRequestCount());
    checks.push(this._checkSuccessRate());
    checks.push(this._checkAverageRoutingTime());

    const overall = this._aggregateStatus(checks);

    return {
      status: overall,
      timestamp: Date.now(),
      checks,
      summary: `Router health: ${overall}`,
    };
  }

  private _checkRequestCount(): RouterHealthCheckEntry {
    const stats = this._statistics.getStats();
    if (stats.totalRequests > 0) {
      return { name: 'request-count', status: 'healthy', message: `${stats.totalRequests} requests processed` };
    }
    return { name: 'request-count', status: 'degraded', message: 'No requests processed' };
  }

  private _checkSuccessRate(): RouterHealthCheckEntry {
    const stats = this._statistics.getStats();
    const rate = stats.totalRequests > 0 ? stats.successfulRoutes / stats.totalRequests : 1.0;
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

  private _checkAverageRoutingTime(): RouterHealthCheckEntry {
    const stats = this._statistics.getStats();
    const avg = stats.averageRoutingTime;
    if (avg <= 5) {
      return { name: 'avg-routing-time', status: 'healthy', message: `Avg: ${avg.toFixed(2)}ms`, details: { avg } };
    }
    if (avg <= 20) {
      return { name: 'avg-routing-time', status: 'degraded', message: `Avg: ${avg.toFixed(2)}ms`, details: { avg } };
    }
    return { name: 'avg-routing-time', status: 'unhealthy', message: `Avg: ${avg.toFixed(2)}ms`, details: { avg } };
  }

  private _aggregateStatus(checks: RouterHealthCheckEntry[]): RouterHealthStatus {
    if (checks.some((c) => c.status === 'unhealthy')) return 'unhealthy';
    if (checks.some((c) => c.status === 'degraded')) return 'degraded';
    return 'healthy';
  }
}
