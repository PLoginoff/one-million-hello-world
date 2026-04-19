/**
 * Network Metrics
 * 
 * Tracks and aggregates network performance metrics.
 */

export interface NetworkMetricData {
  name: string;
  value: number;
  unit: string;
  timestamp: number;
  tags: Record<string, string>;
}

export interface MetricSummary {
  count: number;
  min: number;
  max: number;
  average: number;
  sum: number;
  lastValue: number;
}

export class NetworkMetrics {
  private metrics: Map<string, NetworkMetricData[]>;
  private maxSamples: number;

  constructor(maxSamples: number = 1000) {
    this.metrics = new Map();
    this.maxSamples = maxSamples;
  }

  /**
   * Record a metric
   */
  record(name: string, value: number, unit: string = '', tags: Record<string, string> = {}): void {
    const data: NetworkMetricData = {
      name,
      value,
      unit,
      timestamp: Date.now(),
      tags,
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const samples = this.metrics.get(name)!;
    samples.push(data);

    if (samples.length > this.maxSamples) {
      samples.shift();
    }
  }

  /**
   * Get metric samples
   */
  getSamples(name: string): NetworkMetricData[] {
    return this.metrics.get(name) || [];
  }

  /**
   * Get metric summary
   */
  getSummary(name: string): MetricSummary | null {
    const samples = this.getSamples(name);
    if (samples.length === 0) return null;

    const values = samples.map(s => s.value);
    const sum = values.reduce((acc, v) => acc + v, 0);
    const min = Math.min(...values);
    const max = Math.max(...values);

    return {
      count: samples.length,
      min,
      max,
      average: sum / samples.length,
      sum,
      lastValue: values[values.length - 1],
    };
  }

  /**
   * Get latest metric value
   */
  getLatest(name: string): NetworkMetricData | null {
    const samples = this.getSamples(name);
    return samples.length > 0 ? samples[samples.length - 1] : null;
  }

  /**
   * Get metric by time range
   */
  getByTimeRange(name: string, startTime: number, endTime: number): NetworkMetricData[] {
    const samples = this.getSamples(name);
    return samples.filter(s => s.timestamp >= startTime && s.timestamp <= endTime);
  }

  /**
   * Clear metric samples
   */
  clear(name: string): void {
    this.metrics.delete(name);
  }

  /**
   * Clear all metrics
   */
  clearAll(): void {
    this.metrics.clear();
  }

  /**
   * Get all metric names
   */
  getMetricNames(): string[] {
    return Array.from(this.metrics.keys());
  }

  /**
   * Get total sample count
   */
  getTotalSampleCount(): number {
    let total = 0;
    for (const samples of this.metrics.values()) {
      total += samples.length;
    }
    return total;
  }

  /**
   * Increment a counter metric
   */
  increment(name: string, amount: number = 1, tags: Record<string, string> = {}): void {
    const latest = this.getLatest(name);
    const newValue = latest ? latest.value + amount : amount;
    this.record(name, newValue, 'count', tags);
  }

  /**
   * Record a gauge metric
   */
  gauge(name: string, value: number, tags: Record<string, string> = {}): void {
    this.record(name, value, 'gauge', tags);
  }

  /**
   * Record a timing metric
   */
  timing(name: string, duration: number, tags: Record<string, string> = {}): void {
    this.record(name, duration, 'ms', tags);
  }

  /**
   * Measure execution time of a function
   */
  async measure<T>(
    name: string,
    fn: () => Promise<T>,
    tags: Record<string, string> = {},
  ): Promise<T> {
    const startTime = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      this.timing(name, duration, { ...tags, success: 'true' });
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.timing(name, duration, { ...tags, success: 'false' });
      throw error;
    }
  }
}
