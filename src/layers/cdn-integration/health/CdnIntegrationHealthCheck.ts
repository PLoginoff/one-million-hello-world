import { CdnIntegrationMetricsCollector } from '../statistics/CdnIntegrationMetricsCollector';

export type CdnIntegrationHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface CdnIntegrationHealthCheckResult {
  status: CdnIntegrationHealthStatus;
  timestamp: number;
  checks: CdnIntegrationHealthCheckEntry[];
  summary: string;
}

export interface CdnIntegrationHealthCheckEntry {
  name: string;
  status: CdnIntegrationHealthStatus;
  message: string;
  details?: Record<string, unknown>;
}

export class CdnIntegrationHealthCheck {
  private readonly _collector: CdnIntegrationMetricsCollector;

  constructor(collector: CdnIntegrationMetricsCollector) {
    this._collector = collector;
  }

  check(): CdnIntegrationHealthCheckResult {
    const checks: CdnIntegrationHealthCheckEntry[] = [];
    checks.push(this._checkExecutionCount());
    checks.push(this._checkSuccessRate());
    checks.push(this._checkAverageTime());
    const overall = this._aggregateStatus(checks);
    return { status: overall, timestamp: Date.now(), checks, summary: 'CdnIntegration health: ' + overall };
  }

  private _checkExecutionCount(): CdnIntegrationHealthCheckEntry {
    const m = this._collector.getMetrics();
    if (m.executionCount > 0) {
      return { name: 'execution-count', status: 'healthy', message: m.executionCount + ' executions' };
    }
    return { name: 'execution-count', status: 'degraded', message: 'No executions recorded' };
  }

  private _checkSuccessRate(): CdnIntegrationHealthCheckEntry {
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

  private _checkAverageTime(): CdnIntegrationHealthCheckEntry {
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

  private _aggregateStatus(checks: CdnIntegrationHealthCheckEntry[]): CdnIntegrationHealthStatus {
    if (
      checks.some(function (c) {
        return c.status === 'unhealthy';
      })
    )
      return 'unhealthy';
    if (
      checks.some(function (c) {
        return c.status === 'degraded';
      })
    )
      return 'degraded';
    return 'healthy';
  }
}
