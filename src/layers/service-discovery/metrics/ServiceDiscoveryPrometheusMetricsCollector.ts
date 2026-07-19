import { ServiceDiscoveryMetricsCollector } from '../statistics/ServiceDiscoveryMetricsCollector';

export interface ServiceDiscoveryPrometheusMetrics {
  service_discovery_executions_total: number;
  service_discovery_successful_executions_total: number;
  service_discovery_failed_executions_total: number;
  service_discovery_avg_execution_time_ms: number;
  service_discovery_active_operations: number;
  collectedAt: number;
}

export interface ServiceDiscoveryMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class ServiceDiscoveryPrometheusMetricsCollector {
  private readonly _collector: ServiceDiscoveryMetricsCollector;
  private _collectionCount: number;

  constructor(collector: ServiceDiscoveryMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): ServiceDiscoveryPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      service_discovery_executions_total: m.executionCount,
      service_discovery_successful_executions_total: m.successCount,
      service_discovery_failed_executions_total: m.failureCount,
      service_discovery_avg_execution_time_ms: m.averageExecutionTime,
      service_discovery_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): ServiceDiscoveryMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      {
        name: 'service_discovery_executions_total',
        value: m.service_discovery_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'service_discovery_successful_executions_total',
        value: m.service_discovery_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'service_discovery_failed_executions_total',
        value: m.service_discovery_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'service_discovery_avg_execution_time_ms',
        value: m.service_discovery_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'service_discovery_active_operations',
        value: m.service_discovery_active_operations,
        labels: {},
        timestamp: ts,
      },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP service_discovery_executions_total Total executions',
      '# TYPE service_discovery_executions_total counter',
      '# HELP service_discovery_successful_executions_total Total successful executions',
      '# TYPE service_discovery_successful_executions_total counter',
      '# HELP service_discovery_failed_executions_total Total failed executions',
      '# TYPE service_discovery_failed_executions_total counter',
      '# HELP service_discovery_avg_execution_time_ms Average execution time in ms',
      '# TYPE service_discovery_avg_execution_time_ms gauge',
      '# HELP service_discovery_active_operations Current active operations',
      '# TYPE service_discovery_active_operations gauge',
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
