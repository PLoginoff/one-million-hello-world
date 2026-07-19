/**
 * Rate Limiting Health Check
 */

import { RateLimitStatistics } from '../statistics/RateLimitStatistics';

export type RateLimitingHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface RateLimitingHealthCheckResult {
  status: RateLimitingHealthStatus;
  timestamp: number;
  checks: RateLimitingHealthCheckEntry[];
  summary: string;
}

export interface RateLimitingHealthCheckEntry {
  name: string;
  status: RateLimitingHealthStatus;
  message: string;
  details?: Record<string, unknown>;
}

export class RateLimitingHealthCheck {
  private readonly _statistics: RateLimitStatistics;

  constructor(statistics: RateLimitStatistics) {
    this._statistics = statistics;
  }

  check(): RateLimitingHealthCheckResult {
    const checks: RateLimitingHealthCheckEntry[] = [];

    checks.push(this._checkRequestCount());
    checks.push(this._checkAllowRate());
    checks.push(this._checkAvgResponseTime());

    const overall = this._aggregateStatus(checks);

    return {
      status: overall,
      timestamp: Date.now(),
      checks,
      summary: `Rate limiting health: ${overall}`,
    };
  }

  private _checkRequestCount(): RateLimitingHealthCheckEntry {
    const stats = this._statistics.getStats();
    if (stats.totalRequests > 0) {
      return { name: 'request-count', status: 'healthy', message: `${stats.totalRequests} requests processed` };
    }
    return { name: 'request-count', status: 'degraded', message: 'No requests processed' };
  }

  private _checkAllowRate(): RateLimitingHealthCheckEntry {
    const stats = this._statistics.getStats();
    const rate = stats.totalRequests > 0 ? stats.allowedRequests / stats.totalRequests : 1.0;
    if (rate >= 0.9) {
      return {
        name: 'allow-rate',
        status: 'healthy',
        message: `Allow rate: ${(rate * 100).toFixed(2)}%`,
        details: { rate },
      };
    }
    if (rate >= 0.5) {
      return {
        name: 'allow-rate',
        status: 'degraded',
        message: `Allow rate: ${(rate * 100).toFixed(2)}%`,
        details: { rate },
      };
    }
    return {
      name: 'allow-rate',
      status: 'unhealthy',
      message: `Allow rate: ${(rate * 100).toFixed(2)}%`,
      details: { rate },
    };
  }

  private _checkAvgResponseTime(): RateLimitingHealthCheckEntry {
    const stats = this._statistics.getStats();
    const avg = stats.averageResponseTime;
    if (avg <= 5) {
      return { name: 'avg-response-time', status: 'healthy', message: `Avg: ${avg.toFixed(2)}ms`, details: { avg } };
    }
    if (avg <= 20) {
      return { name: 'avg-response-time', status: 'degraded', message: `Avg: ${avg.toFixed(2)}ms`, details: { avg } };
    }
    return { name: 'avg-response-time', status: 'unhealthy', message: `Avg: ${avg.toFixed(2)}ms`, details: { avg } };
  }

  private _aggregateStatus(checks: RateLimitingHealthCheckEntry[]): RateLimitingHealthStatus {
    if (checks.some((c) => c.status === 'unhealthy')) return 'unhealthy';
    if (checks.some((c) => c.status === 'degraded')) return 'degraded';
    return 'healthy';
  }
}
