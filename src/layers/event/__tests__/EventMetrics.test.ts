/**
 * Metrics tests for Event layer
 */

import { EventMetricsCollector } from '../metrics/EventMetricsCollector';
import { EventPrometheusExporter } from '../metrics/EventPrometheusExporter';

describe('EventMetricsCollector', () => {
  let collector: EventMetricsCollector;

  beforeEach(() => {
    collector = new EventMetricsCollector();
  });

  afterEach(() => {
    collector.stopCollection();
  });

  it('should record publish events', () => {
    collector.recordPublish('test', 10, true);
    collector.recordPublish('test', 20, true);
    collector.recordPublish('test', 30, false);

    const metrics = collector.getMetrics();
    expect(metrics.publishedTotal).toBe(3);
    expect(metrics.errorTotal).toBe(1);
    expect(metrics.eventsByType.test).toBe(3);
  });

  it('should record handle events', () => {
    collector.recordHandle('test', 5, true);
    collector.recordHandle('test', 10, true);

    const metrics = collector.getMetrics();
    expect(metrics.handledTotal).toBe(2);
  });

  it('should calculate rates', () => {
    collector.recordPublish('test', 10, true);
    collector.recordPublish('test', 20, true);

    const metrics = collector.getMetrics();
    expect(metrics.publishRate).toBeGreaterThan(0);
  });

  it('should calculate latency percentiles', () => {
    collector.recordPublish('test', 10, true);
    collector.recordPublish('test', 20, true);
    collector.recordPublish('test', 30, true);
    collector.recordPublish('test', 40, true);
    collector.recordPublish('test', 50, true);

    const metrics = collector.getMetrics();
    expect(metrics.latencyPercentiles.p50).toBeGreaterThan(0);
    expect(metrics.latencyPercentiles.p90).toBeGreaterThanOrEqual(metrics.latencyPercentiles.p50);
    expect(metrics.latencyPercentiles.p95).toBeGreaterThanOrEqual(metrics.latencyPercentiles.p90);
    expect(metrics.latencyPercentiles.p99).toBeGreaterThanOrEqual(metrics.latencyPercentiles.p95);
  });

  it('should record dead letter events', () => {
    collector.recordDeadLetter('test', 'TIMEOUT');
    collector.recordDeadLetter('test', 'NETWORK_ERROR');

    const metrics = collector.getMetrics();
    expect(metrics.deadLetterQueueSize).toBeGreaterThanOrEqual(0);
  });

  it('should record dead letter replays', () => {
    collector.recordDeadLetterReplay('test', true);
    collector.recordDeadLetterReplay('test', false);

    const metrics = collector.getMetrics();
    expect(metrics.deadLetterReplayCount).toBe(2);
  });

  it('should record subscription changes', () => {
    collector.recordSubscriptionChange('test', 1);
    collector.recordSubscriptionChange('test', 1);
    collector.recordSubscriptionChange('test', -1);

    const metrics = collector.getMetrics();
    expect(metrics.activeSubscriptions).toBe(1);
  });

  it('should track errors by type', () => {
    collector.recordPublish('test', 10, false);
    collector.recordHandle('test', 5, false);

    const metrics = collector.getMetrics();
    expect(Object.keys(metrics.errorsByType).length).toBeGreaterThan(0);
  });

  it('should support counters', () => {
    collector.incrementCounter('custom.counter', 1, { tag: 'value' });
    collector.incrementCounter('custom.counter', 2, { tag: 'value' });

    expect(collector.getCounter('custom.counter', { tag: 'value' })).toBe(3);
  });

  it('should support gauges', () => {
    collector.setGauge('custom.gauge', 42, { tag: 'value' });
    expect(collector.getGauge('custom.gauge', { tag: 'value' })).toBe(42);
  });

  it('should support histograms', () => {
    collector.recordHistogram('custom.histogram', 100, { tag: 'value' });
    collector.recordHistogram('custom.histogram', 200, { tag: 'value' });

    const values = collector.getHistogram('custom.histogram', { tag: 'value' });
    expect(values).toEqual([100, 200]);
  });

  it('should support samples', () => {
    collector.recordSample({ name: 'custom.sample', value: 1, unit: 'count', tags: {}, timestamp: Date.now() });
    const samples = collector.getSamples('custom.sample');
    expect(samples.length).toBe(1);
  });

  it('should reset metrics', () => {
    collector.recordPublish('test', 10, true);
    collector.reset();
    const metrics = collector.getMetrics();
    expect(metrics.publishedTotal).toBe(0);
    expect(metrics.handledTotal).toBe(0);
    expect(metrics.errorTotal).toBe(0);
  });

  it('should get metric names', () => {
    collector.recordPublish('test', 10, true);
    collector.recordHandle('test', 5, true);
    const names = collector.getMetricNames();
    expect(names).toContain('event.publish.total');
    expect(names).toContain('event.handle.total');
  });

  it('should track uptime', () => {
    const uptime = collector.getUptimeSeconds();
    expect(uptime).toBeGreaterThanOrEqual(0);
  });

  it('should start and stop collection', () => {
    collector.startCollection();
    collector.stopCollection();
    // No errors means success
  });

  it('should calculate average latency', () => {
    collector.recordPublish('test', 10, true);
    collector.recordPublish('test', 20, true);
    collector.recordPublish('test', 30, true);

    const metrics = collector.getMetrics();
    expect(metrics.avgPublishLatencyMs).toBe(20);
  });
});

describe('EventPrometheusExporter', () => {
  let collector: EventMetricsCollector;
  let exporter: EventPrometheusExporter;

  beforeEach(() => {
    collector = new EventMetricsCollector();
    exporter = new EventPrometheusExporter(collector);
  });

  afterEach(() => {
    collector.stopCollection();
  });

  it('should collect metrics', () => {
    collector.recordPublish('test', 10, true);
    collector.recordHandle('test', 5, true);

    const metrics = exporter.collect();
    expect(metrics.length).toBeGreaterThan(0);
    expect(metrics.some(m => m.name === 'event_published_total')).toBe(true);
    expect(metrics.some(m => m.name === 'event_handled_total')).toBe(true);
  });

  it('should export to Prometheus format', () => {
    collector.recordPublish('test', 10, true);
    collector.recordHandle('test', 5, true);

    const output = exporter.toPrometheusString();
    expect(output).toContain('event_published_total');
    expect(output).toContain('event_handled_total');
    expect(output).toContain('# HELP');
    expect(output).toContain('# TYPE');
  });

  it('should include histogram buckets', () => {
    collector.recordPublish('test', 10, true);
    collector.recordPublish('test', 20, true);
    collector.recordPublish('test', 30, true);

    const output = exporter.toPrometheusString();
    expect(output).toContain('event_publish_latency_seconds_bucket');
    expect(output).toContain('event_publish_latency_seconds_sum');
    expect(output).toContain('event_publish_latency_seconds_count');
  });

  it('should include gauge metrics', () => {
    collector.recordPublish('test', 10, true);

    const output = exporter.toPrometheusString();
    expect(output).toContain('event_active_subscriptions');
    expect(output).toContain('event_publish_rate');
    expect(output).toContain('event_uptime_seconds');
  });

  it('should include dead letter metrics', () => {
    collector.recordDeadLetter('test', 'TIMEOUT');
    collector.recordDeadLetterReplay('test', true);

    const output = exporter.toPrometheusString();
    expect(output).toContain('event_deadletter_total');
    expect(output).toContain('event_deadletter_replay_total');
  });

  it('should track collection count', () => {
    exporter.collect();
    exporter.collect();
    expect(exporter.getCollectionCount()).toBe(2);
  });

  it('should update config', () => {
    exporter.updateConfig({ metricPrefix: 'custom_' });
    const config = exporter.getConfig();
    expect(config.metricPrefix).toBe('custom_');
  });

  it('should create HTTP handler', () => {
    const { createPrometheusHandler } = require('../metrics/EventPrometheusExporter');
    const handler = createPrometheusHandler(exporter);
    expect(typeof handler).toBe('function');
  });
});

describe('Prometheus handler', () => {
  it('should create handler function', async () => {
    const collector = new EventMetricsCollector();
    const exporter = new EventPrometheusExporter(collector);
    collector.recordPublish('test', 10, true);

    const { createPrometheusHandler } = await import('../metrics/EventPrometheusExporter');
    const handler = createPrometheusHandler(exporter);
    const result = await handler();

    expect(result.body).toContain('event_published_total');
    expect(result.headers['Content-Type']).toContain('text/plain');
  });
});