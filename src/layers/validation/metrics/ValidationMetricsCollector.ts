/**
 * Validation Metrics Collector
 */

import { ValidationStatistics } from '../statistics/ValidationStatistics';

export interface ValidationMetrics {
  validationTotalValidations: number;
  validationSuccessfulTotal: number;
  validationFailedTotal: number;
  validationTotalErrors: number;
  validationTotalWarnings: number;
  validationAverageTimeMs: number;
  collectedAt: number;
}

export interface ValidationMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class ValidationMetricsCollector {
  private readonly _statistics: ValidationStatistics;
  private _collectionCount: number;

  constructor(statistics: ValidationStatistics) {
    this._statistics = statistics;
    this._collectionCount = 0;
  }

  collect(): ValidationMetrics {
    const stats = this._statistics.getStats();
    this._collectionCount++;
    return {
      validationTotalValidations: stats.totalValidations,
      validationSuccessfulTotal: stats.successfulValidations,
      validationFailedTotal: stats.failedValidations,
      validationTotalErrors: stats.totalErrors,
      validationTotalWarnings: stats.totalWarnings,
      validationAverageTimeMs: stats.averageValidationTime,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): ValidationMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'validation_total', value: m.validationTotalValidations, labels: {}, timestamp: ts },
      { name: 'validation_successful_total', value: m.validationSuccessfulTotal, labels: {}, timestamp: ts },
      { name: 'validation_failed_total', value: m.validationFailedTotal, labels: {}, timestamp: ts },
      { name: 'validation_errors_total', value: m.validationTotalErrors, labels: {}, timestamp: ts },
      { name: 'validation_warnings_total', value: m.validationTotalWarnings, labels: {}, timestamp: ts },
      { name: 'validation_avg_time_ms', value: m.validationAverageTimeMs, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP validation_total Total validations',
      '# TYPE validation_total counter',
      '# HELP validation_successful_total Total successful validations',
      '# TYPE validation_successful_total counter',
      '# HELP validation_failed_total Total failed validations',
      '# TYPE validation_failed_total counter',
      '# HELP validation_errors_total Total validation errors',
      '# TYPE validation_errors_total counter',
      '# HELP validation_warnings_total Total validation warnings',
      '# TYPE validation_warnings_total counter',
      '# HELP validation_avg_time_ms Average validation time in ms',
      '# TYPE validation_avg_time_ms gauge',
    ];

    for (const s of samples) {
      lines.push(`${s.name} ${s.value} ${s.timestamp}`);
    }

    return lines.join('\n') + '\n';
  }

  getCollectionCount(): number {
    return this._collectionCount;
  }
}
