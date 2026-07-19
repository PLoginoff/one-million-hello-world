import { DeadLetterMetricsCollector } from '../statistics/DeadLetterMetricsCollector';

export interface DeadLetterPrometheusMetrics {
  dead_letter_executions_total: number;
  dead_letter_successful_executions_total: number;
  dead_letter_failed_executions_total: number;
  dead_letter_avg_execution_time_ms: number;
  dead_letter_active_operations: number;
  collectedAt: number;
}

export interface DeadLetterMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class DeadLetterPrometheusMetricsCollector {
  private readonly _collector: DeadLetterMetricsCollector;
  private _collectionCount: number;

  constructor(collector: DeadLetterMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): DeadLetterPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      dead_letter_executions_total: m.executionCount,
      dead_letter_successful_executions_total: m.successCount,
      dead_letter_failed_executions_total: m.failureCount,
      dead_letter_avg_execution_time_ms: m.averageExecutionTime,
      dead_letter_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): DeadLetterMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'dead_letter_executions_total', value: m.dead_letter_executions_total, labels: {}, timestamp: ts },
      {
        name: 'dead_letter_successful_executions_total',
        value: m.dead_letter_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'dead_letter_failed_executions_total',
        value: m.dead_letter_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'dead_letter_avg_execution_time_ms',
        value: m.dead_letter_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      { name: 'dead_letter_active_operations', value: m.dead_letter_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP dead_letter_executions_total Total executions',
      '# TYPE dead_letter_executions_total counter',
      '# HELP dead_letter_successful_executions_total Total successful executions',
      '# TYPE dead_letter_successful_executions_total counter',
      '# HELP dead_letter_failed_executions_total Total failed executions',
      '# TYPE dead_letter_failed_executions_total counter',
      '# HELP dead_letter_avg_execution_time_ms Average execution time in ms',
      '# TYPE dead_letter_avg_execution_time_ms gauge',
      '# HELP dead_letter_active_operations Current active operations',
      '# TYPE dead_letter_active_operations gauge',
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
