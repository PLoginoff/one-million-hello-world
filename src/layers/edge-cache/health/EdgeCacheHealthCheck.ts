import { EdgeCacheMetricsCollector } from '../statistics/EdgeCacheMetricsCollector';

export type EdgeCacheHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface EdgeCacheHealthCheckResult {
  status: EdgeCacheHealthStatus;
  timestamp: number;
  checks: EdgeCacheHealthCheckEntry[];
  summary: string;
}

export interface EdgeCacheHealthCheckEntry {
  name: string;
  status: EdgeCacheHealthStatus;
  message: string;
  details?: Record<string, unknown>;
}

export class EdgeCacheHealthCheck {
  private readonly _collector: EdgeCacheMetricsCollector;

  constructor(collector: EdgeCacheMetricsCollector) {
    this._collector = collector;
  }

  check(): EdgeCacheHealthCheckResult {
    const checks: EdgeCacheHealthCheckEntry[] = [];

    checks.push(this._checkExecutionCount());
    checks.push(this._checkSuccessRate());
    checks.push(this._checkAverageTime());

    const overall = this._aggregateStatus(checks);

    return {
      status: overall,
      timestamp: Date.now(),
      checks,
      summary: 'EdgeCache health: ' + overall,
    };
  }

  private _checkExecutionCount(): EdgeCacheHealthCheckEntry {
    const m = this._collector.getMetrics();
    if (m.executionCount > 0) {
      return { name: 'execution-count', status: 'healthy', message: m.executionCount + ' executions' };
    }
    return { name: 'execution-count', status: 'degraded', message: 'No executions recorded' };
  }

  private _checkSuccessRate(): EdgeCacheHealthCheckEntry {
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

  private _checkAverageTime(): EdgeCacheHealthCheckEntry {
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

  private _aggregateStatus(checks: EdgeCacheHealthCheckEntry[]): EdgeCacheHealthStatus {
    if (checks.some((c) => c.status === 'unhealthy')) return 'unhealthy';
    if (checks.some((c) => c.status === 'degraded')) return 'degraded';
    return 'healthy';
  }
}
