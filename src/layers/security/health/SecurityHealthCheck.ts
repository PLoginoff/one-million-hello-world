/**
 * Security Health Check
 */

import { SecurityStatistics } from '../statistics/SecurityStatistics';

export type SecurityHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface SecurityHealthCheckResult {
  status: SecurityHealthStatus;
  timestamp: number;
  checks: SecurityHealthCheckEntry[];
  summary: string;
}

export interface SecurityHealthCheckEntry {
  name: string;
  status: SecurityHealthStatus;
  message: string;
  details?: Record<string, unknown>;
}

export class SecurityHealthCheck {
  private readonly _statistics: SecurityStatistics;

  constructor(statistics: SecurityStatistics) {
    this._statistics = statistics;
  }

  check(): SecurityHealthCheckResult {
    const checks: SecurityHealthCheckEntry[] = [];

    checks.push(this._checkAuthCount());
    checks.push(this._checkAuthSuccessRate());
    checks.push(this._checkThreats());
    checks.push(this._checkAvgAuthTime());

    const overall = this._aggregateStatus(checks);

    return {
      status: overall,
      timestamp: Date.now(),
      checks,
      summary: `Security health: ${overall}`,
    };
  }

  private _checkAuthCount(): SecurityHealthCheckEntry {
    const stats = this._statistics.getStats();
    if (stats.totalAuthentications > 0) {
      return { name: 'auth-count', status: 'healthy', message: `${stats.totalAuthentications} auth attempts` };
    }
    return { name: 'auth-count', status: 'degraded', message: 'No auth attempts recorded' };
  }

  private _checkAuthSuccessRate(): SecurityHealthCheckEntry {
    const stats = this._statistics.getStats();
    const rate = stats.totalAuthentications > 0 ? stats.successfulAuthentications / stats.totalAuthentications : 1.0;
    if (rate >= 0.95) {
      return {
        name: 'auth-success-rate',
        status: 'healthy',
        message: `Auth success: ${(rate * 100).toFixed(2)}%`,
        details: { rate },
      };
    }
    if (rate >= 0.8) {
      return {
        name: 'auth-success-rate',
        status: 'degraded',
        message: `Auth success: ${(rate * 100).toFixed(2)}%`,
        details: { rate },
      };
    }
    return {
      name: 'auth-success-rate',
      status: 'unhealthy',
      message: `Auth success: ${(rate * 100).toFixed(2)}%`,
      details: { rate },
    };
  }

  private _checkThreats(): SecurityHealthCheckEntry {
    const stats = this._statistics.getStats();
    if (stats.totalThreatsDetected === 0) {
      return { name: 'threats', status: 'healthy', message: 'No threats detected' };
    }
    if (stats.totalThreatsDetected < 10) {
      return {
        name: 'threats',
        status: 'degraded',
        message: `${stats.totalThreatsDetected} threats detected`,
        details: { count: stats.totalThreatsDetected },
      };
    }
    return {
      name: 'threats',
      status: 'unhealthy',
      message: `${stats.totalThreatsDetected} threats detected`,
      details: { count: stats.totalThreatsDetected },
    };
  }

  private _checkAvgAuthTime(): SecurityHealthCheckEntry {
    const stats = this._statistics.getStats();
    const avg = stats.averageAuthenticationTime;
    if (avg <= 50) {
      return { name: 'avg-auth-time', status: 'healthy', message: `Avg: ${avg.toFixed(2)}ms`, details: { avg } };
    }
    if (avg <= 200) {
      return { name: 'avg-auth-time', status: 'degraded', message: `Avg: ${avg.toFixed(2)}ms`, details: { avg } };
    }
    return { name: 'avg-auth-time', status: 'unhealthy', message: `Avg: ${avg.toFixed(2)}ms`, details: { avg } };
  }

  private _aggregateStatus(checks: SecurityHealthCheckEntry[]): SecurityHealthStatus {
    if (checks.some((c) => c.status === 'unhealthy')) return 'unhealthy';
    if (checks.some((c) => c.status === 'degraded')) return 'degraded';
    return 'healthy';
  }
}
