import { OnboardingMetricsCollector } from '../statistics/OnboardingMetricsCollector';

export interface OnboardingPrometheusMetrics {
  onboarding_executions_total: number;
  onboarding_successful_executions_total: number;
  onboarding_failed_executions_total: number;
  onboarding_avg_execution_time_ms: number;
  onboarding_active_operations: number;
  collectedAt: number;
}

export interface OnboardingMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class OnboardingPrometheusMetricsCollector {
  private readonly _collector: OnboardingMetricsCollector;
  private _collectionCount: number;

  constructor(collector: OnboardingMetricsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): OnboardingPrometheusMetrics {
    const m = this._collector.getMetrics();
    this._collectionCount++;
    return {
      onboarding_executions_total: m.executionCount,
      onboarding_successful_executions_total: m.successCount,
      onboarding_failed_executions_total: m.failureCount,
      onboarding_avg_execution_time_ms: m.averageExecutionTime,
      onboarding_active_operations: m.activeOperations,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): OnboardingMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'onboarding_executions_total', value: m.onboarding_executions_total, labels: {}, timestamp: ts },
      {
        name: 'onboarding_successful_executions_total',
        value: m.onboarding_successful_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'onboarding_failed_executions_total',
        value: m.onboarding_failed_executions_total,
        labels: {},
        timestamp: ts,
      },
      {
        name: 'onboarding_avg_execution_time_ms',
        value: m.onboarding_avg_execution_time_ms,
        labels: {},
        timestamp: ts,
      },
      { name: 'onboarding_active_operations', value: m.onboarding_active_operations, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP onboarding_executions_total Total executions',
      '# TYPE onboarding_executions_total counter',
      '# HELP onboarding_successful_executions_total Total successful executions',
      '# TYPE onboarding_successful_executions_total counter',
      '# HELP onboarding_failed_executions_total Total failed executions',
      '# TYPE onboarding_failed_executions_total counter',
      '# HELP onboarding_avg_execution_time_ms Average execution time in ms',
      '# TYPE onboarding_avg_execution_time_ms gauge',
      '# HELP onboarding_active_operations Current active operations',
      '# TYPE onboarding_active_operations gauge',
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
