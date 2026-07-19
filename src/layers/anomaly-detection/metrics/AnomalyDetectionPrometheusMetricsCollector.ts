import { AnomalyDetectionMetricsCollector } from '../statistics/AnomalyDetectionMetricsCollector';

export interface AnomalyDetectionPrometheusMetrics {
  anomaly_detection_executions_total: number;
  anomaly_detection_successful_executions_total: number;
  anomaly_detection_failed_executions_total: number;
  anomaly_detection_avg_execution_time_ms: number;
  anomaly_detection_active_operations: number;
  collectedAt: number;
}

export interface AnomalyDetectionMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class AnomalyDetectionPrometheusMetricsCollector {
  private readonly _collector: AnomalyDetectionMetricsCollector;
  private _collectionCount: number;

  constructor(collector: AnomalyDetectionMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): AnomalyDetectionPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      anomaly_detection_executions_total: m.executionCount,
      anomaly_detection_successful_executions_total: m.successCount,
      anomaly_detection_failed_executions_total: m.failureCount,
      anomaly_detection_avg_execution_time_ms: m.averageExecutionTime,
      anomaly_detection_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): AnomalyDetectionMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      {
        name: 'anomaly_detection_executions_total',
        value: m.anomaly_detection_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'anomaly_detection_successful_executions_total',
        value: m.anomaly_detection_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'anomaly_detection_failed_executions_total',
        value: m.anomaly_detection_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'anomaly_detection_avg_execution_time_ms',
        value: m.anomaly_detection_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'anomaly_detection_active_operations',
        value: m.anomaly_detection_active_operations,
        labels: {},
        timestamp: ts,
      },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP anomaly_detection_executions_total Total executions',
      '# TYPE anomaly_detection_executions_total counter',
      '# HELP anomaly_detection_successful_executions_total Total successful executions',
      '# TYPE anomaly_detection_successful_executions_total counter',
      '# HELP anomaly_detection_failed_executions_total Total failed executions',
      '# TYPE anomaly_detection_failed_executions_total counter',
      '# HELP anomaly_detection_avg_execution_time_ms Average execution time in ms',
      '# TYPE anomaly_detection_avg_execution_time_ms gauge',
      '# HELP anomaly_detection_active_operations Current active operations',
      '# TYPE anomaly_detection_active_operations gauge',
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
