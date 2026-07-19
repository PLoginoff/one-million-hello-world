/**
 * Controller Metrics Collector Unit Tests
 */

import { ControllerMetricsCollector } from '../metrics/ControllerMetricsCollector';
import { ControllerStatistics } from '../statistics/ControllerStatistics';

describe('ControllerMetricsCollector', () => {
  let statistics: ControllerStatistics;
  let collector: ControllerMetricsCollector;

  beforeEach(() => {
    statistics = new ControllerStatistics();
    collector = new ControllerMetricsCollector(statistics);
  });

  it('should collect metrics from statistics', () => {
    statistics.recordSuccess(50, 'ctrl-1');
    statistics.recordSuccess(30, 'ctrl-1');
    statistics.recordFailure(20);

    const metrics = collector.collect();
    expect(metrics.controllerInvocationsTotal).toBe(3);
    expect(metrics.controllerSuccessfulInvocationsTotal).toBe(2);
    expect(metrics.controllerFailedInvocationsTotal).toBe(1);
    expect(metrics.controllerSuccessRate).toBeCloseTo(2 / 3, 5);
    expect(metrics.collectedAt).toBeGreaterThan(0);
  });

  it('should increment collection count', () => {
    collector.collect();
    collector.collect();
    expect(collector.getCollectionCount()).toBe(2);
  });

  it('should produce Prometheus-format samples', () => {
    statistics.recordSuccess(50, 'ctrl-1');

    const samples = collector.collectAsPrometheusSamples();
    expect(samples.length).toBeGreaterThan(0);

    const names = samples.map((s) => s.name);
    expect(names).toContain('controller_invocations_total');
    expect(names).toContain('controller_successful_invocations_total');
    expect(names).toContain('controller_failed_invocations_total');
    expect(names).toContain('controller_success_rate');
    expect(names).toContain('controller_avg_execution_time_ms');
  });

  it('should include per-controller samples with labels', () => {
    statistics.recordSuccess(50, 'ctrl-1');
    statistics.recordSuccess(30, 'ctrl-2');

    const samples = collector.collectAsPrometheusSamples();
    const perController = samples.filter((s: { name: string; value: number; labels: Record<string, string>; timestamp: number }) => s.name === 'controller_invocations_by_controller');
    expect(perController.length).toBe(2);
    expect(perController[0].labels.controller_id).toBeDefined();
  });

  it('should generate valid Prometheus text', () => {
    statistics.recordSuccess(50, 'ctrl-1');

    const text = collector.toPrometheusString();
    expect(text).toContain('# HELP controller_invocations_total');
    expect(text).toContain('# TYPE controller_invocations_total counter');
    expect(text).toContain('controller_invocations_total');
  });
});
