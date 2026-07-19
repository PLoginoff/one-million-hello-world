import { CircuitBreakerMetricsCollector } from '../statistics/CircuitBreakerMetricsCollector';

export interface CircuitBreakerPrometheusMetrics {
  circuit_breaker_executions_total: number;
  circuit_breaker_successful_executions_total: number;
  circuit_breaker_failed_executions_total: number;
  circuit_breaker_avg_execution_time_ms: number;
  circuit_breaker_active_operations: number;
  collectedAt: number;
}

export interface CircuitBreakerMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class CircuitBreakerPrometheusMetricsCollector {
  private readonly _collector: CircuitBreakerMetricsCollector;
  private _collectionCount: number;

  constructor(collector: CircuitBreakerMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): CircuitBreakerPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      circuit_breaker_executions_total: m.executionCount,
      circuit_breaker_successful_executions_total: m.successCount,
      circuit_breaker_failed_executions_total: m.failureCount,
      circuit_breaker_avg_execution_time_ms: m.averageExecutionTime,
      circuit_breaker_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): CircuitBreakerMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      {
        name: 'circuit_breaker_executions_total',
        value: m.circuit_breaker_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'circuit_breaker_successful_executions_total',
        value: m.circuit_breaker_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'circuit_breaker_failed_executions_total',
        value: m.circuit_breaker_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'circuit_breaker_avg_execution_time_ms',
        value: m.circuit_breaker_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'circuit_breaker_active_operations',
        value: m.circuit_breaker_active_operations,
        labels: {},
        timestamp: ts,
      },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP circuit_breaker_executions_total Total executions',
      '# TYPE circuit_breaker_executions_total counter',
      '# HELP circuit_breaker_successful_executions_total Total successful executions',
      '# TYPE circuit_breaker_successful_executions_total counter',
      '# HELP circuit_breaker_failed_executions_total Total failed executions',
      '# TYPE circuit_breaker_failed_executions_total counter',
      '# HELP circuit_breaker_avg_execution_time_ms Average execution time in ms',
      '# TYPE circuit_breaker_avg_execution_time_ms gauge',
      '# HELP circuit_breaker_active_operations Current active operations',
      '# TYPE circuit_breaker_active_operations gauge',
    ];

    for (const s of samples) {
      lines.push(s.name + ' ' + s.value + ' ' + s.timestamp);
    }

    return lines.join('\n') + '\n';
  }

  getCollectionCount(): number {
    return this._collectionCount;
  }
}
