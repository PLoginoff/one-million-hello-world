import { RulesEngineMetricsCollector } from '../statistics/RulesEngineMetricsCollector';

export interface RulesEnginePrometheusMetrics {
  rules_engine_executions_total: number;
  rules_engine_successful_executions_total: number;
  rules_engine_failed_executions_total: number;
  rules_engine_avg_execution_time_ms: number;
  rules_engine_active_operations: number;
  collectedAt: number;
}

export interface RulesEngineMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class RulesEnginePrometheusMetricsCollector {
  private readonly _collector: RulesEngineMetricsCollector;
  private _collectionCount: number;

  constructor(collector: RulesEngineMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): RulesEnginePrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      rules_engine_executions_total: m.executionCount,
      rules_engine_successful_executions_total: m.successCount,
      rules_engine_failed_executions_total: m.failureCount,
      rules_engine_avg_execution_time_ms: m.averageExecutionTime,
      rules_engine_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): RulesEngineMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'rules_engine_executions_total', value: m.rules_engine_executions_total, labels: {}, timestamp: ts },
      {
        name: 'rules_engine_successful_executions_total',
        value: m.rules_engine_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'rules_engine_failed_executions_total',
        value: m.rules_engine_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'rules_engine_avg_execution_time_ms',
        value: m.rules_engine_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      { name: 'rules_engine_active_operations', value: m.rules_engine_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP rules_engine_executions_total Total executions',
      '# TYPE rules_engine_executions_total counter',
      '# HELP rules_engine_successful_executions_total Total successful executions',
      '# TYPE rules_engine_successful_executions_total counter',
      '# HELP rules_engine_failed_executions_total Total failed executions',
      '# TYPE rules_engine_failed_executions_total counter',
      '# HELP rules_engine_avg_execution_time_ms Average execution time in ms',
      '# TYPE rules_engine_avg_execution_time_ms gauge',
      '# HELP rules_engine_active_operations Current active operations',
      '# TYPE rules_engine_active_operations gauge',
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
