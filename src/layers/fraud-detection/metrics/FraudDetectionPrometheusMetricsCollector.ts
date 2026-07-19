import { FraudDetectionMetricsCollector } from '../statistics/FraudDetectionMetricsCollector';

export interface FraudDetectionPrometheusMetrics {
  fraud_detection_executions_total: number;
  fraud_detection_successful_executions_total: number;
  fraud_detection_failed_executions_total: number;
  fraud_detection_avg_execution_time_ms: number;
  fraud_detection_active_operations: number;
  collectedAt: number;
}

export interface FraudDetectionMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class FraudDetectionPrometheusMetricsCollector {
  private readonly _collector: FraudDetectionMetricsCollector;
  private _collectionCount: number;

  constructor(collector: FraudDetectionMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): FraudDetectionPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      fraud_detection_executions_total: m.executionCount,
      fraud_detection_successful_executions_total: m.successCount,
      fraud_detection_failed_executions_total: m.failureCount,
      fraud_detection_avg_execution_time_ms: m.averageExecutionTime,
      fraud_detection_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): FraudDetectionMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      {
        name: 'fraud_detection_executions_total',
        value: m.fraud_detection_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'fraud_detection_successful_executions_total',
        value: m.fraud_detection_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'fraud_detection_failed_executions_total',
        value: m.fraud_detection_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'fraud_detection_avg_execution_time_ms',
        value: m.fraud_detection_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'fraud_detection_active_operations',
        value: m.fraud_detection_active_operations,
        labels: {},
        timestamp: ts,
      },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP fraud_detection_executions_total Total executions',
      '# TYPE fraud_detection_executions_total counter',
      '# HELP fraud_detection_successful_executions_total Total successful executions',
      '# TYPE fraud_detection_successful_executions_total counter',
      '# HELP fraud_detection_failed_executions_total Total failed executions',
      '# TYPE fraud_detection_failed_executions_total counter',
      '# HELP fraud_detection_avg_execution_time_ms Average execution time in ms',
      '# TYPE fraud_detection_avg_execution_time_ms gauge',
      '# HELP fraud_detection_active_operations Current active operations',
      '# TYPE fraud_detection_active_operations gauge',
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
