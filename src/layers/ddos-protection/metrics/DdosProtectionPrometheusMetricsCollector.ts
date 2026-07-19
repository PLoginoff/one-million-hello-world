import { DdosProtectionMetricsCollector } from '../statistics/DdosProtectionMetricsCollector';

export interface DdosProtectionPrometheusMetrics {
  ddos_protection_executions_total: number;
  ddos_protection_successful_executions_total: number;
  ddos_protection_failed_executions_total: number;
  ddos_protection_avg_execution_time_ms: number;
  ddos_protection_active_operations: number;
  collectedAt: number;
}

export interface DdosProtectionMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class DdosProtectionPrometheusMetricsCollector {
  private readonly _collector: DdosProtectionMetricsCollector;
  private _collectionCount: number;

  constructor(collector: DdosProtectionMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): DdosProtectionPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      ddos_protection_executions_total: m.executionCount,
      ddos_protection_successful_executions_total: m.successCount,
      ddos_protection_failed_executions_total: m.failureCount,
      ddos_protection_avg_execution_time_ms: m.averageExecutionTime,
      ddos_protection_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): DdosProtectionMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      {
        name: 'ddos_protection_executions_total',
        value: m.ddos_protection_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'ddos_protection_successful_executions_total',
        value: m.ddos_protection_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'ddos_protection_failed_executions_total',
        value: m.ddos_protection_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'ddos_protection_avg_execution_time_ms',
        value: m.ddos_protection_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'ddos_protection_active_operations',
        value: m.ddos_protection_active_operations,
        labels: {},
        timestamp: ts,
      },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP ddos_protection_executions_total Total executions',
      '# TYPE ddos_protection_executions_total counter',
      '# HELP ddos_protection_successful_executions_total Total successful executions',
      '# TYPE ddos_protection_successful_executions_total counter',
      '# HELP ddos_protection_failed_executions_total Total failed executions',
      '# TYPE ddos_protection_failed_executions_total counter',
      '# HELP ddos_protection_avg_execution_time_ms Average execution time in ms',
      '# TYPE ddos_protection_avg_execution_time_ms gauge',
      '# HELP ddos_protection_active_operations Current active operations',
      '# TYPE ddos_protection_active_operations gauge',
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
