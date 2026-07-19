/**
 * Service Metrics Collector
 *
 * Collects and exposes metrics for the service layer.
 * Provides Prometheus-compatible metric names and labels.
 */

import { ServiceStatistics } from '../statistics/ServiceStatistics';

export interface ServiceMetrics {
  serviceExecutionsTotal: number;
  serviceSuccessfulExecutionsTotal: number;
  serviceFailedExecutionsTotal: number;
  serviceSuccessRate: number;
  serviceFailureRate: number;
  serviceAverageExecutionTimeMs: number;
  serviceMostExecuted: Array<{ id: string; count: number }>;
  collectedAt: number;
}

export interface ServiceMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class ServiceMetricsCollector {
  private readonly _statistics: ServiceStatistics;
  private _collectionCount: number;

  constructor(statistics: ServiceStatistics) {
    this._statistics = statistics;
    this._collectionCount = 0;
  }

  collect(): ServiceMetrics {
    const stats = this._statistics.getStats();
    this._collectionCount++;

    return {
      serviceExecutionsTotal: stats.totalExecutions,
      serviceSuccessfulExecutionsTotal: stats.successfulExecutions,
      serviceFailedExecutionsTotal: stats.failedExecutions,
      serviceSuccessRate: this._statistics.getSuccessRate(),
      serviceFailureRate: this._statistics.getFailureRate(),
      serviceAverageExecutionTimeMs: stats.averageExecutionTime,
      serviceMostExecuted: stats.mostExecutedServices.map((s) => ({ id: s.id, count: s.count })),
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): ServiceMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    const samples: ServiceMetricSample[] = [];

    samples.push({ name: 'service_executions_total', value: m.serviceExecutionsTotal, labels: {}, timestamp: ts });
    samples.push({
      name: 'service_successful_executions_total',
      value: m.serviceSuccessfulExecutionsTotal,
      labels: {},
      timestamp: ts,
    });
    samples.push({
      name: 'service_failed_executions_total',
      value: m.serviceFailedExecutionsTotal,
      labels: {},
      timestamp: ts,
    });
    samples.push({ name: 'service_success_rate', value: m.serviceSuccessRate, labels: {}, timestamp: ts });
    samples.push({ name: 'service_failure_rate', value: m.serviceFailureRate, labels: {}, timestamp: ts });
    samples.push({
      name: 'service_avg_execution_time_ms',
      value: m.serviceAverageExecutionTimeMs,
      labels: {},
      timestamp: ts,
    });

    for (const svc of m.serviceMostExecuted) {
      samples.push({
        name: 'service_executions_by_service',
        value: svc.count,
        labels: { service_id: svc.id },
        timestamp: ts,
      });
    }

    return samples;
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [];

    const helpByName: Record<string, string> = {
      service_executions_total: '# HELP service_executions_total Total service executions',
      service_successful_executions_total:
        '# HELP service_successful_executions_total Total successful service executions',
      service_failed_executions_total: '# HELP service_failed_executions_total Total failed service executions',
      service_success_rate: '# HELP service_success_rate Service success rate (0-1)',
      service_failure_rate: '# HELP service_failure_rate Service failure rate (0-1)',
      service_avg_execution_time_ms: '# HELP service_avg_execution_time_ms Average service execution time in ms',
      service_executions_by_service: '# HELP service_executions_by_service Executions per service',
    };

    const typeByName: Record<string, string> = {
      service_executions_total: '# TYPE service_executions_total counter',
      service_successful_executions_total: '# TYPE service_successful_executions_total counter',
      service_failed_executions_total: '# TYPE service_failed_executions_total counter',
      service_success_rate: '# TYPE service_success_rate gauge',
      service_failure_rate: '# TYPE service_failure_rate gauge',
      service_avg_execution_time_ms: '# TYPE service_avg_execution_time_ms gauge',
      service_executions_by_service: '# TYPE service_executions_by_service counter',
    };

    const seen = new Set<string>();
    for (const s of samples) {
      if (!seen.has(s.name)) {
        if (helpByName[s.name] !== undefined) lines.push(helpByName[s.name]);
        if (typeByName[s.name] !== undefined) lines.push(typeByName[s.name]);
        seen.add(s.name);
      }
      const labelStr =
        Object.keys(s.labels).length > 0
          ? '{' +
            Object.entries(s.labels)
              .map(([k, v]) => `${k}="${v}"`)
              .join(',') +
            '}'
          : '';
      lines.push(`${s.name}${labelStr} ${s.value} ${s.timestamp}`);
    }

    return lines.join('\n') + '\n';
  }

  getCollectionCount(): number {
    return this._collectionCount;
  }
}
