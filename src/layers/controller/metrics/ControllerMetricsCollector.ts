/**
 * Controller Metrics Collector
 *
 * Collects and exposes metrics for the controller layer.
 * Provides Prometheus-compatible metric names and labels.
 */

import { ControllerStatistics } from '../statistics/ControllerStatistics';

export interface ControllerMetrics {
  controllerInvocationsTotal: number;
  controllerSuccessfulInvocationsTotal: number;
  controllerFailedInvocationsTotal: number;
  controllerSuccessRate: number;
  controllerFailureRate: number;
  controllerAverageExecutionTimeMs: number;
  controllerMostInvoked: Array<{ id: string; count: number }>;
  collectedAt: number;
}

export interface MetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class ControllerMetricsCollector {
  private readonly _statistics: ControllerStatistics;
  private _collectionCount: number;

  constructor(statistics: ControllerStatistics) {
    this._statistics = statistics;
    this._collectionCount = 0;
  }

  collect(): ControllerMetrics {
    const stats = this._statistics.getStats();
    this._collectionCount++;

    return {
      controllerInvocationsTotal: stats.totalInvocations,
      controllerSuccessfulInvocationsTotal: stats.successfulInvocations,
      controllerFailedInvocationsTotal: stats.failedInvocations,
      controllerSuccessRate: this._statistics.getSuccessRate(),
      controllerFailureRate: this._statistics.getFailureRate(),
      controllerAverageExecutionTimeMs: stats.averageExecutionTime,
      controllerMostInvoked: stats.mostInvokedControllers.map((c) => ({ id: c.id, count: c.count })),
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): MetricSample[] {
    const metrics = this.collect();
    const ts = metrics.collectedAt;
    const samples: MetricSample[] = [];

    samples.push({
      name: 'controller_invocations_total',
      value: metrics.controllerInvocationsTotal,
      labels: {},
      timestamp: ts,
    });
    samples.push({
      name: 'controller_successful_invocations_total',
      value: metrics.controllerSuccessfulInvocationsTotal,
      labels: {},
      timestamp: ts,
    });
    samples.push({
      name: 'controller_failed_invocations_total',
      value: metrics.controllerFailedInvocationsTotal,
      labels: {},
      timestamp: ts,
    });
    samples.push({
      name: 'controller_success_rate',
      value: metrics.controllerSuccessRate,
      labels: {},
      timestamp: ts,
    });
    samples.push({
      name: 'controller_failure_rate',
      value: metrics.controllerFailureRate,
      labels: {},
      timestamp: ts,
    });
    samples.push({
      name: 'controller_avg_execution_time_ms',
      value: metrics.controllerAverageExecutionTimeMs,
      labels: {},
      timestamp: ts,
    });

    for (const controller of metrics.controllerMostInvoked) {
      samples.push({
        name: 'controller_invocations_by_controller',
        value: controller.count,
        labels: { controller_id: controller.id },
        timestamp: ts,
      });
    }

    return samples;
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [];

    const helpByName: Record<string, string> = {
      controller_invocations_total: '# HELP controller_invocations_total Total controller invocations',
      controller_successful_invocations_total:
        '# HELP controller_successful_invocations_total Total successful controller invocations',
      controller_failed_invocations_total:
        '# HELP controller_failed_invocations_total Total failed controller invocations',
      controller_success_rate: '# HELP controller_success_rate Controller success rate (0-1)',
      controller_failure_rate: '# HELP controller_failure_rate Controller failure rate (0-1)',
      controller_avg_execution_time_ms:
        '# HELP controller_avg_execution_time_ms Average controller execution time in milliseconds',
      controller_invocations_by_controller: '# HELP controller_invocations_by_controller Invocations per controller',
    };

    const typeByName: Record<string, string> = {
      controller_invocations_total: '# TYPE controller_invocations_total counter',
      controller_successful_invocations_total: '# TYPE controller_successful_invocations_total counter',
      controller_failed_invocations_total: '# TYPE controller_failed_invocations_total counter',
      controller_success_rate: '# TYPE controller_success_rate gauge',
      controller_failure_rate: '# TYPE controller_failure_rate gauge',
      controller_avg_execution_time_ms: '# TYPE controller_avg_execution_time_ms gauge',
      controller_invocations_by_controller: '# TYPE controller_invocations_by_controller counter',
    };

    const seenHelp = new Set<string>();
    for (const sample of samples) {
      if (!seenHelp.has(sample.name)) {
        if (helpByName[sample.name] !== undefined) lines.push(helpByName[sample.name]);
        if (typeByName[sample.name] !== undefined) lines.push(typeByName[sample.name]);
        seenHelp.add(sample.name);
      }
      const labelStr =
        Object.keys(sample.labels).length > 0
          ? '{' +
            Object.entries(sample.labels)
              .map(([k, v]) => `${k}="${v}"`)
              .join(',') +
            '}'
          : '';
      lines.push(`${sample.name}${labelStr} ${sample.value} ${sample.timestamp}`);
    }

    return lines.join('\n') + '\n';
  }

  getCollectionCount(): number {
    return this._collectionCount;
  }
}
