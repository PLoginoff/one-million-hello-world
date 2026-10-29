/**
 * Event Metrics Collector
 *
 * Collects and aggregates event bus metrics including publish/subscribe rates,
 * latency distributions, dead letter counts, and throughput measurements.
 *
 * @module EventLayer/Metrics
 */

/**
 * Event metric sample.
 */
export interface EventMetricSample {
  /** Metric name */
  name: string;
  /** Metric value */
  value: number;
  /** Metric unit */
  unit: string;
  /** Tags for dimensional analysis */
  tags: Record<string, string>;
  /** Timestamp */
  timestamp: number;
}

/**
 * Aggregated event metrics.
 */
export interface EventMetrics {
  /** Total events published */
  publishedTotal: number;
  /** Total events handled */
  handledTotal: number;
  /** Total errors */
  errorTotal: number;
  /** Current publish rate (events/sec) */
  publishRate: number;
  /** Current handle rate (events/sec) */
  handleRate: number;
  /** Average publish latency (ms) */
  avgPublishLatencyMs: number;
  /** Average handle latency (ms) */
  avgHandleLatencyMs: number;
  /** Latency percentiles */
  latencyPercentiles: {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  };
  /** Dead letter queue size */
  deadLetterQueueSize: number;
  /** Dead letter replay count */
  deadLetterReplayCount: number;
  /** Active subscriptions */
  activeSubscriptions: number;
  /** Events by type */
  eventsByType: Record<string, number>;
  /** Errors by type */
  errorsByType: Record<string, number>;
  /** Timestamp of last update */
  lastUpdated: number;
}

/**
 * Configuration for metrics collector.
 */
export interface EventMetricsCollectorConfig {
  /** Maximum number of samples to keep per metric */
  maxSamplesPerMetric: number;
  /** Sample retention period (ms) */
  sampleRetentionMs: number;
  /** Enable percentile calculation */
  enablePercentiles: boolean;
  /** Percentiles to calculate */
  percentiles: number[];
  /** Collection interval (ms) */
  collectionIntervalMs: number;
}

/**
 * Default metrics collector configuration.
 */
export const DEFAULT_METRICS_CONFIG: EventMetricsCollectorConfig = {
  maxSamplesPerMetric: 10000,
  sampleRetentionMs: 3600000, // 1 hour
  enablePercentiles: true,
  percentiles: [0.5, 0.9, 0.95, 0.99],
  collectionIntervalMs: 10000,
};

/**
 * Event Metrics Collector implementation.
 * Provides comprehensive metrics collection for event bus operations.
 */
export class EventMetricsCollector {
  private readonly _config: EventMetricsCollectorConfig;
  private readonly _samples: Map<string, EventMetricSample[]> = new Map();
  private readonly _counters: Map<string, number> = new Map();
  private readonly _gauges: Map<string, number> = new Map();
  private readonly _histograms: Map<string, number[]> = new Map();
  private readonly _startTime: number;
  private _collectionTimer: ReturnType<typeof setInterval> | null = null;
  private _lastPublishTime: number = 0;
  private _lastHandleTime: number = 0;
  private _publishCount: number = 0;
  private _handleCount: number = 0;
  private _errorCount: number = 0;

  /**
   * Creates a new EventMetricsCollector.
   *
   * @param config - Optional configuration
   */
  constructor(config: Partial<EventMetricsCollectorConfig> = {}) {
    this._config = { ...DEFAULT_METRICS_CONFIG, ...config };
    this._startTime = Date.now();
  }

  /**
   * Starts periodic metric collection.
   */
  startCollection(): void {
    if (this._collectionTimer) return;

    this._collectionTimer = setInterval(() => {
      this._collectPeriodicMetrics();
    }, this._config.collectionIntervalMs);
  }

  /**
   * Stops periodic metric collection.
   */
  stopCollection(): void {
    if (this._collectionTimer) {
      clearInterval(this._collectionTimer);
      this._collectionTimer = null;
    }
  }

  /**
   * Records a metric sample.
   *
   * @param sample - Metric sample to record
   */
  recordSample(sample: EventMetricSample): void {
    const existing = this._samples.get(sample.name) ?? [];
    existing.push(sample);

    // Trim old samples
    const cutoff = Date.now() - this._config.sampleRetentionMs;
    const filtered = existing.filter((s) => s.timestamp > cutoff);

    // Limit sample count
    if (filtered.length > this._config.maxSamplesPerMetric) {
      filtered.splice(0, filtered.length - this._config.maxSamplesPerMetric);
    }

    this._samples.set(sample.name, filtered);
  }

  /**
   * Increments a counter.
   *
   * @param name - Counter name
   * @param value - Value to increment by (default: 1)
   * @param tags - Tags for dimensional analysis
   */
  incrementCounter(name: string, value: number = 1, tags: Record<string, string> = {}): void {
    const key = this._makeKey(name, tags);
    const current = this._counters.get(key) ?? 0;
    this._counters.set(key, current + value);

    this.recordSample({
      name,
      value: current + value,
      unit: 'count',
      tags,
      timestamp: Date.now(),
    });
  }

  /**
   * Sets a gauge value.
   *
   * @param name - Gauge name
   * @param value - Gauge value
   * @param tags - Tags for dimensional analysis
   */
  setGauge(name: string, value: number, tags: Record<string, string> = {}): void {
    const key = this._makeKey(name, tags);
    this._gauges.set(key, value);

    this.recordSample({
      name,
      value,
      unit: 'gauge',
      tags,
      timestamp: Date.now(),
    });
  }

  /**
   * Records a histogram value.
   *
   * @param name - Histogram name
   * @param value - Value to record
   * @param tags - Tags for dimensional analysis
   */
  recordHistogram(name: string, value: number, tags: Record<string, string> = {}): void {
    const key = this._makeKey(name, tags);
    const existing = this._histograms.get(key) ?? [];
    existing.push(value);

    // Limit histogram size
    if (existing.length > this._config.maxSamplesPerMetric) {
      existing.shift();
    }

    this._histograms.set(key, existing);

    this.recordSample({
      name,
      value,
      unit: 'ms',
      tags,
      timestamp: Date.now(),
    });
  }

  /**
   * Records an event publish.
   *
   * @param eventType - Event type
   * @param latencyMs - Publish latency in ms
   * @param success - Whether publish succeeded
   */
  recordPublish(eventType: string, latencyMs: number, success: boolean = true): void {
    this._publishCount++;
    this._lastPublishTime = Date.now();

    this.incrementCounter('event.publish.total', 1, { eventType, success: String(success) });
    this.recordHistogram('event.publish.latency', latencyMs, { eventType });

    if (!success) {
      this.incrementCounter('event.publish.errors', 1, { eventType });
      this._errorCount++;
    }
  }

  /**
   * Records an event handle.
   *
   * @param eventType - Event type
   * @param latencyMs - Handle latency in ms
   * @param success - Whether handle succeeded
   */
  recordHandle(eventType: string, latencyMs: number, success: boolean = true): void {
    this._handleCount++;
    this._lastHandleTime = Date.now();

    this.incrementCounter('event.handle.total', 1, { eventType, success: String(success) });
    this.recordHistogram('event.handle.latency', latencyMs, { eventType });

    if (!success) {
      this.incrementCounter('event.handle.errors', 1, { eventType });
      this._errorCount++;
    }
  }

  /**
   * Records a dead letter event.
   *
   * @param eventType - Event type
   * @param errorCode - Error code
   */
  recordDeadLetter(eventType: string, errorCode: string): void {
    this.incrementCounter('event.deadletter.total', 1, { eventType, errorCode });
    this.setGauge('event.deadletter.queue_size', this.getDeadLetterQueueSize());
  }

  /**
   * Records a dead letter replay.
   *
   * @param eventType - Event type
   * @param success - Whether replay succeeded
   */
  recordDeadLetterReplay(eventType: string, success: boolean): void {
    this.incrementCounter('event.deadletter.replay', 1, { eventType, success: String(success) });
  }

  /**
   * Records subscription changes.
   *
   * @param eventType - Event type
   * @param change - Change in subscription count (+1/-1)
   */
  recordSubscriptionChange(eventType: string, change: number): void {
    this.incrementCounter('event.subscription.changes', change, { eventType });
    const current = this.getGauge('event.subscription.active');
    this.setGauge('event.subscription.active', current + change);
  }

  /**
   * Gets aggregated metrics.
   *
   * @returns Current metrics snapshot
   */
  getMetrics(): EventMetrics {
    const now = Date.now();
    const uptimeSec = Math.max((now - this._startTime) / 1000, 0.001); // Min 1ms window

    // Calculate rates
    const publishRate = uptimeSec > 0 ? this._publishCount / uptimeSec : 0;
    const handleRate = uptimeSec > 0 ? this._handleCount / uptimeSec : 0;

    // Calculate latency percentiles
    const publishLatencies = this._getAllHistogramValues('event.publish.latency');
    const handleLatencies = this._getAllHistogramValues('event.handle.latency');
    const allLatencies = [...publishLatencies, ...handleLatencies];

    const latencyPercentiles = this._calculatePercentiles(allLatencies);
    const avgPublishLatency = publishLatencies.length > 0
      ? publishLatencies.reduce((a, b) => a + b, 0) / publishLatencies.length
      : 0;
    const avgHandleLatency = handleLatencies.length > 0
      ? handleLatencies.reduce((a, b) => a + b, 0) / handleLatencies.length
      : 0;

    // Get events by type
    const eventsByType: Record<string, number> = {};
    for (const [key, value] of this._counters.entries()) {
      if (key.startsWith('event.publish.total|')) {
        const tags = this._parseKey(key);
        eventsByType[tags.eventType] = (eventsByType[tags.eventType] ?? 0) + value;
      }
    }

    // Get errors by type
    const errorsByType: Record<string, number> = {};
    for (const [key, value] of this._counters.entries()) {
      if (key.startsWith('event.publish.errors|') || key.startsWith('event.handle.errors|')) {
        const tags = this._parseKey(key);
        const type = tags.eventType ?? 'unknown';
        errorsByType[type] = (errorsByType[type] ?? 0) + value;
      }
    }

    return {
      publishedTotal: this._publishCount,
      handledTotal: this._handleCount,
      errorTotal: this._errorCount,
      publishRate,
      handleRate,
      avgPublishLatencyMs: avgPublishLatency,
      avgHandleLatencyMs: avgHandleLatency,
      latencyPercentiles,
      deadLetterQueueSize: this.getDeadLetterQueueSize(),
      deadLetterReplayCount: this.getCounterSum('event.deadletter.replay'),
      activeSubscriptions: this.getActiveSubscriptions(),
      eventsByType,
      errorsByType,
      lastUpdated: now,
    };
  }

  /**
   * Gets a counter value.
   */
  getCounter(name: string, tags: Record<string, string> = {}): number {
    const key = this._makeKey(name, tags);
    return this._counters.get(key) ?? 0;
  }

  /**
   * Gets the sum of all counter values with a given prefix.
   */
  getCounterSum(prefix: string): number {
    let sum = 0;
    for (const [key, value] of this._counters.entries()) {
      if (key.startsWith(prefix + '|') || key === prefix) {
        sum += value;
      }
    }
    return sum;
  }

  /**
   * Gets a gauge value.
   */
  getGauge(name: string, tags: Record<string, string> = {}): number {
    const key = this._makeKey(name, tags);
    return this._gauges.get(key) ?? 0;
  }

  /**
   * Gets histogram values.
   */
  getHistogram(name: string, tags: Record<string, string> = {}): number[] {
    const key = this._makeKey(name, tags);
    return [...(this._histograms.get(key) ?? [])];
  }

  /**
   * Gets all histogram values for a metric name across all tag combinations.
   */
  getAllHistogramValues(name: string): number[] {
    return this._getAllHistogramValues(name);
  }

  /**
   * Gets all samples for a metric.
   */
  getSamples(name: string): EventMetricSample[] {
    return [...(this._samples.get(name) ?? [])];
  }

  /**
   * Gets all metric names.
   */
  getMetricNames(): string[] {
    return Array.from(this._samples.keys());
  }

  /**
   * Resets all metrics.
   */
  reset(): void {
    this._samples.clear();
    this._counters.clear();
    this._gauges.clear();
    this._histograms.clear();
    this._publishCount = 0;
    this._handleCount = 0;
    this._errorCount = 0;
    this._lastPublishTime = 0;
    this._lastHandleTime = 0;
  }

  /**
   * Gets the dead letter queue size (from gauge).
   */
  getDeadLetterQueueSize(): number {
    return this.getGauge('event.deadletter.queue_size');
  }

  /**
   * Gets active subscription count (from gauge).
   */
  getActiveSubscriptions(): number {
    return this.getGauge('event.subscription.active');
  }

  /**
   * Gets uptime in seconds.
   */
  getUptimeSeconds(): number {
    return (Date.now() - this._startTime) / 1000;
  }

  /**
   * Collects periodic metrics (rates, etc.).
   */
  private _collectPeriodicMetrics(): void {
    const now = Date.now();
    const uptimeSec = (now - this._startTime) / 1000;

    // Record current rates
    this.setGauge('event.publish.rate', uptimeSec > 0 ? this._publishCount / uptimeSec : 0);
    this.setGauge('event.handle.rate', uptimeSec > 0 ? this._handleCount / uptimeSec : 0);
    this.setGauge('event.error.rate', uptimeSec > 0 ? this._errorCount / uptimeSec : 0);
    this.setGauge('event.uptime', uptimeSec);
  }

  /**
   * Gets all histogram values across all tag combinations.
   */
  private _getAllHistogramValues(name: string): number[] {
    const values: number[] = [];
    for (const [key, vals] of this._histograms.entries()) {
      if (key.startsWith(name + '|') || key === name) {
        values.push(...vals);
      }
    }
    return values;
  }

  /**
   * Calculates percentiles from sorted values.
   */
  private _calculatePercentiles(values: number[]): { p50: number; p90: number; p95: number; p99: number } {
    if (values.length === 0) {
      return { p50: 0, p90: 0, p95: 0, p99: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);

    return {
      p50: this._percentile(sorted, 0.5),
      p90: this._percentile(sorted, 0.9),
      p95: this._percentile(sorted, 0.95),
      p99: this._percentile(sorted, 0.99),
    };
  }

  /**
   * Calculates a single percentile.
   */
  private _percentile(sorted: number[], p: number): number {
    const index = Math.ceil(p * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }

  /**
   * Creates a key from name and tags.
   */
  private _makeKey(name: string, tags: Record<string, string>): string {
    const tagStr = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return tagStr ? `${name}|${tagStr}` : name;
  }

  /**
   * Parses a key into tags.
   */
  private _parseKey(key: string): Record<string, string> {
    const parts = key.split('|');
    const tags: Record<string, string> = {};

    if (parts[1]) {
      for (const pair of parts[1].split(',')) {
        const [k, v] = pair.split('=');
        if (k) tags[k] = v ?? '';
      }
    }

    return tags;
  }
}