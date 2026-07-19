import { SchedulingMetricsCollector } from '../statistics/SchedulingMetricsCollector';

export type SchedulingHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface SchedulingHealthCheckResult {
  status: SchedulingHealthStatus;
  timestamp: number;
  checks: SchedulingHealthCheckEntry[];
  summary: string;
}

export interface SchedulingHealthCheckEntry {
  name: string;
  status: SchedulingHealthStatus;
  message: string;
  details?: Record<string, unknown>;
}

export class SchedulingHealthCheck {
  private readonly _collector: SchedulingMetricsCollector;

  constructor(collector: SchedulingMetricsCollector) {
    this._collector = collector;
  }

  check(): SchedulingHealthCheckResult {
    const checks: SchedulingHealthCheckEntry[] = [];
    checks.push(this._checkExecutionCount());
    checks.push(this._checkSuccessRate());
    checks.push(this._checkAverageTime());
    const overall = this._aggregateStatus(checks);
    return { status: overall, timestamp: Date.now(), checks, summary: 'Scheduling health: ' + overall };
  }

  private _checkExecutionCount(): SchedulingHealthCheckEntry {
    const m = this._collector.getMetrics();
    if (m.executionCount > 0) {
      return { name: 'execution-count', status: 'healthy', message: m.executionCount + ' executions' };
    }
    return { name: 'execution-count', status: 'degraded', message: 'No executions recorded' };
  }

  private _checkSuccessRate(): SchedulingHealthCheckEntry {
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

  private _checkAverageTime(): SchedulingHealthCheckEntry {
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

  private _aggregateStatus(checks: SchedulingHealthCheckEntry[]): SchedulingHealthStatus {
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
