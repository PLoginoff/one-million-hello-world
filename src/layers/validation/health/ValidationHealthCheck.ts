/**
 * Validation Health Check
 */

import { ValidationStatistics } from '../statistics/ValidationStatistics';

export type ValidationHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface ValidationHealthCheckResult {
  status: ValidationHealthStatus;
  timestamp: number;
  checks: ValidationHealthCheckEntry[];
  summary: string;
}

export interface ValidationHealthCheckEntry {
  name: string;
  status: ValidationHealthStatus;
  message: string;
  details?: Record<string, unknown>;
}

export class ValidationHealthCheck {
  private readonly _statistics: ValidationStatistics;

  constructor(statistics: ValidationStatistics) {
    this._statistics = statistics;
  }

  check(): ValidationHealthCheckResult {
    const checks: ValidationHealthCheckEntry[] = [];

    checks.push(this._checkValidationCount());
    checks.push(this._checkSuccessRate());
    checks.push(this._checkAverageValidationTime());

    const overall = this._aggregateStatus(checks);

    return {
      status: overall,
      timestamp: Date.now(),
      checks,
      summary: `Validation health: ${overall}`,
    };
  }

  private _checkValidationCount(): ValidationHealthCheckEntry {
    const stats = this._statistics.getStats();
    if (stats.totalValidations > 0) {
      return { name: 'validation-count', status: 'healthy', message: `${stats.totalValidations} validations recorded` };
    }
    return { name: 'validation-count', status: 'degraded', message: 'No validations recorded' };
  }

  private _checkSuccessRate(): ValidationHealthCheckEntry {
    const stats = this._statistics.getStats();
    const rate = stats.totalValidations > 0 ? stats.successfulValidations / stats.totalValidations : 1.0;
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

  private _checkAverageValidationTime(): ValidationHealthCheckEntry {
    const stats = this._statistics.getStats();
    const avg = stats.averageValidationTime;
    if (avg <= 5) {
      return { name: 'avg-validation-time', status: 'healthy', message: `Avg: ${avg.toFixed(2)}ms`, details: { avg } };
    }
    if (avg <= 20) {
      return { name: 'avg-validation-time', status: 'degraded', message: `Avg: ${avg.toFixed(2)}ms`, details: { avg } };
    }
    return { name: 'avg-validation-time', status: 'unhealthy', message: `Avg: ${avg.toFixed(2)}ms`, details: { avg } };
  }

  private _aggregateStatus(checks: ValidationHealthCheckEntry[]): ValidationHealthStatus {
    if (checks.some((c) => c.status === 'unhealthy')) return 'unhealthy';
    if (checks.some((c) => c.status === 'degraded')) return 'degraded';
    return 'healthy';
  }
}
