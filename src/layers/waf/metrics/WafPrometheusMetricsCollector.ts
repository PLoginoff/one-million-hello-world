import { WafMetricsCollector } from '../statistics/WafMetricsCollector';

export interface WafPrometheusMetrics {
  waf_executions_total: number;
  waf_successful_executions_total: number;
  waf_failed_executions_total: number;
  waf_avg_execution_time_ms: number;
  waf_active_operations: number;
  collectedAt: number;
}

export interface WafMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class WafPrometheusMetricsCollector {
  private readonly _collector: WafMetricsCollector;
  private _collectionCount: number;

  constructor(collector: WafMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): WafPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      waf_executions_total: m.executionCount,
      waf_successful_executions_total: m.successCount,
      waf_failed_executions_total: m.failureCount,
      waf_avg_execution_time_ms: m.averageExecutionTime,
      waf_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): WafMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'waf_executions_total', value: m.waf_executions_total, labels: {}, timestamp: ts },
      { name: 'waf_successful_executions_total', value: m.waf_successful_executions_total, labels: {}, timestamp: ts },
      { name: 'waf_failed_executions_total', value: m.waf_failed_executions_total, labels: {}, timestamp: ts },
      { name: 'waf_avg_execution_time_ms', value: m.waf_avg_execution_time_ms, labels: {}, timestamp: ts },
      { name: 'waf_active_operations', value: m.waf_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP waf_executions_total Total executions',
      '# TYPE waf_executions_total counter',
      '# HELP waf_successful_executions_total Total successful executions',
      '# TYPE waf_successful_executions_total counter',
      '# HELP waf_failed_executions_total Total failed executions',
      '# TYPE waf_failed_executions_total counter',
      '# HELP waf_avg_execution_time_ms Average execution time in ms',
      '# TYPE waf_avg_execution_time_ms gauge',
      '# HELP waf_active_operations Current active operations',
      '# TYPE waf_active_operations gauge',
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
