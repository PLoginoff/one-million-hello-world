import { IdentityProviderMetricsCollector } from '../statistics/IdentityProviderMetricsCollector';

export type IdentityProviderHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface IdentityProviderHealthCheckResult {
  status: IdentityProviderHealthStatus;
  timestamp: number;
  checks: IdentityProviderHealthCheckEntry[];
  summary: string;
}

export interface IdentityProviderHealthCheckEntry {
  name: string;
  status: IdentityProviderHealthStatus;
  message: string;
  details?: Record<string, unknown>;
}

export class IdentityProviderHealthCheck {
  private readonly _collector: IdentityProviderMetricsCollector;

  constructor(collector: IdentityProviderMetricsCollector) {
    this._collector = collector;
  }

  check(): IdentityProviderHealthCheckResult {
    const checks: IdentityProviderHealthCheckEntry[] = [];

    checks.push(this._checkExecutionCount());
    checks.push(this._checkSuccessRate());
    checks.push(this._checkAverageTime());

    const overall = this._aggregateStatus(checks);

    return {
      status: overall,
      timestamp: Date.now(),
      checks,
      summary: 'IdentityProvider health: ' + overall,
    };
  }

  private _checkExecutionCount(): IdentityProviderHealthCheckEntry {
    const m = this._collector.getMetrics();
    if (m.executionCount > 0) {
      return { name: 'execution-count', status: 'healthy', message: m.executionCount + ' executions' };
    }
    return { name: 'execution-count', status: 'degraded', message: 'No executions recorded' };
  }

  private _checkSuccessRate(): IdentityProviderHealthCheckEntry {
    const m = this._collector.getMetrics();
    const rate = m.executionCount > 0 ? m.successCount / m.executionCount : 1.0;
    const pct = (rate * 100).toFixed(2) + '%';
    if (rate >= 0.95) {
      return { name: 'success-rate', status: 'healthy', message: 'Success rate: ' + pct, details: { rate } };
    }
    if (rate >= 0.8) {
      return { name: 'success-rate', status: 'degraded', message: 'Success rate: ' + pct, details: { rate } };
    }
    return { name: 'success-rate', status: 'unhealthy', message: 'Success rate: ' + pct, details: { rate } };
  }

  private _checkAverageTime(): IdentityProviderHealthCheckEntry {
    const m = this._collector.getMetrics();
    const avg = m.averageExecutionTime;
    const avgStr = avg.toFixed(2) + 'ms';
    if (avg <= 10) {
      return { name: 'avg-execution-time', status: 'healthy', message: 'Avg: ' + avgStr, details: { avg } };
    }
    if (avg <= 50) {
      return { name: 'avg-execution-time', status: 'degraded', message: 'Avg: ' + avgStr, details: { avg } };
    }
    return { name: 'avg-execution-time', status: 'unhealthy', message: 'Avg: ' + avgStr, details: { avg } };
  }

  private _aggregateStatus(checks: IdentityProviderHealthCheckEntry[]): IdentityProviderHealthStatus {
    if (checks.some((c) => c.status === 'unhealthy')) return 'unhealthy';
    if (checks.some((c) => c.status === 'degraded')) return 'degraded';
    return 'healthy';
  }
}
