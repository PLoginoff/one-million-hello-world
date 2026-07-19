import { CdnIntegrationMetricsCollector } from '../statistics/CdnIntegrationMetricsCollector';

export interface CdnIntegrationPrometheusMetrics {
  cdn_integration_executions_total: number;
  cdn_integration_successful_executions_total: number;
  cdn_integration_failed_executions_total: number;
  cdn_integration_avg_execution_time_ms: number;
  cdn_integration_active_operations: number;
  collectedAt: number;
}

export interface CdnIntegrationMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class CdnIntegrationPrometheusMetricsCollector {
  private readonly _collector: CdnIntegrationMetricsCollector;
  private _collectionCount: number;

  constructor(collector: CdnIntegrationMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): CdnIntegrationPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      cdn_integration_executions_total: m.executionCount,
      cdn_integration_successful_executions_total: m.successCount,
      cdn_integration_failed_executions_total: m.failureCount,
      cdn_integration_avg_execution_time_ms: m.averageExecutionTime,
      cdn_integration_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): CdnIntegrationMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      {
        name: 'cdn_integration_executions_total',
        value: m.cdn_integration_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'cdn_integration_successful_executions_total',
        value: m.cdn_integration_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'cdn_integration_failed_executions_total',
        value: m.cdn_integration_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'cdn_integration_avg_execution_time_ms',
        value: m.cdn_integration_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'cdn_integration_active_operations',
        value: m.cdn_integration_active_operations,
        labels: {},
        timestamp: ts,
      },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP cdn_integration_executions_total Total executions',
      '# TYPE cdn_integration_executions_total counter',
      '# HELP cdn_integration_successful_executions_total Total successful executions',
      '# TYPE cdn_integration_successful_executions_total counter',
      '# HELP cdn_integration_failed_executions_total Total failed executions',
      '# TYPE cdn_integration_failed_executions_total counter',
      '# HELP cdn_integration_avg_execution_time_ms Average execution time in ms',
      '# TYPE cdn_integration_avg_execution_time_ms gauge',
      '# HELP cdn_integration_active_operations Current active operations',
      '# TYPE cdn_integration_active_operations gauge',
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
