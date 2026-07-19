import { RecommendationMetricsCollector } from '../statistics/RecommendationMetricsCollector';

export interface RecommendationPrometheusMetrics {
  recommendation_executions_total: number;
  recommendation_successful_executions_total: number;
  recommendation_failed_executions_total: number;
  recommendation_avg_execution_time_ms: number;
  recommendation_active_operations: number;
  collectedAt: number;
}

export interface RecommendationMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class RecommendationPrometheusMetricsCollector {
  private readonly _collector: RecommendationMetricsCollector;
  private _collectionCount: number;

  constructor(collector: RecommendationMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): RecommendationPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      recommendation_executions_total: m.executionCount,
      recommendation_successful_executions_total: m.successCount,
      recommendation_failed_executions_total: m.failureCount,
      recommendation_avg_execution_time_ms: m.averageExecutionTime,
      recommendation_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): RecommendationMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'recommendation_executions_total', value: m.recommendation_executions_total, labels: {}, timestamp: ts },
      {
        name: 'recommendation_successful_executions_total',
        value: m.recommendation_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'recommendation_failed_executions_total',
        value: m.recommendation_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'recommendation_avg_execution_time_ms',
        value: m.recommendation_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'recommendation_active_operations',
        value: m.recommendation_active_operations,
        labels: {},
        timestamp: ts,
      },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP recommendation_executions_total Total executions',
      '# TYPE recommendation_executions_total counter',
      '# HELP recommendation_successful_executions_total Total successful executions',
      '# TYPE recommendation_successful_executions_total counter',
      '# HELP recommendation_failed_executions_total Total failed executions',
      '# TYPE recommendation_failed_executions_total counter',
      '# HELP recommendation_avg_execution_time_ms Average execution time in ms',
      '# TYPE recommendation_avg_execution_time_ms gauge',
      '# HELP recommendation_active_operations Current active operations',
      '# TYPE recommendation_active_operations gauge',
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
