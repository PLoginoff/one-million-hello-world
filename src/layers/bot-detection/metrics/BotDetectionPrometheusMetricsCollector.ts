import { BotDetectionMetricsCollector } from '../statistics/BotDetectionMetricsCollector';

export interface BotDetectionPrometheusMetrics {
  bot_detection_executions_total: number;
  bot_detection_successful_executions_total: number;
  bot_detection_failed_executions_total: number;
  bot_detection_avg_execution_time_ms: number;
  bot_detection_active_operations: number;
  collectedAt: number;
}

export interface BotDetectionMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class BotDetectionPrometheusMetricsCollector {
  private readonly _collector: BotDetectionMetricsCollector;
  private _collectionCount: number;

  constructor(collector: BotDetectionMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): BotDetectionPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      bot_detection_executions_total: m.executionCount,
      bot_detection_successful_executions_total: m.successCount,
      bot_detection_failed_executions_total: m.failureCount,
      bot_detection_avg_execution_time_ms: m.averageExecutionTime,
      bot_detection_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): BotDetectionMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'bot_detection_executions_total', value: m.bot_detection_executions_total, labels: {}, timestamp: ts },
      {
        name: 'bot_detection_successful_executions_total',
        value: m.bot_detection_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'bot_detection_failed_executions_total',
        value: m.bot_detection_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'bot_detection_avg_execution_time_ms',
        value: m.bot_detection_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      { name: 'bot_detection_active_operations', value: m.bot_detection_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP bot_detection_executions_total Total executions',
      '# TYPE bot_detection_executions_total counter',
      '# HELP bot_detection_successful_executions_total Total successful executions',
      '# TYPE bot_detection_successful_executions_total counter',
      '# HELP bot_detection_failed_executions_total Total failed executions',
      '# TYPE bot_detection_failed_executions_total counter',
      '# HELP bot_detection_avg_execution_time_ms Average execution time in ms',
      '# TYPE bot_detection_avg_execution_time_ms gauge',
      '# HELP bot_detection_active_operations Current active operations',
      '# TYPE bot_detection_active_operations gauge',
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
