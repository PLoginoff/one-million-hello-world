/**
 * Metrics Collector Interface
 * 
 * Defines the contract for collecting metrics.
 */

export interface Metric {
  name: string;
  value: number;
  timestamp: Date;
  tags?: Record<string, string>;
}

export interface CounterMetric extends Metric {
  type: 'counter';
}

export interface GaugeMetric extends Metric {
  type: 'gauge';
}

export interface HistogramMetric extends Metric {
  type: 'histogram';
  buckets: number[];
}

export interface TimingMetric extends Metric {
  type: 'timing';
  duration: number;
}

export type AnyMetric = CounterMetric | GaugeMetric | HistogramMetric | TimingMetric;

export interface IMetricsCollector {
  /**
   * Increments a counter
   */
  increment(name: string, value?: number, tags?: Record<string, string>): void;

  /**
   * Decrements a counter
   */
  decrement(name: string, value?: number, tags?: Record<string, string>): void;

  /**
   * Sets a gauge value
   */
  gauge(name: string, value: number, tags?: Record<string, string>): void;

  /**
   * Records a timing
   */
  timing(name: string, duration: number, tags?: Record<string, string>): void;

  /**
   * Records a histogram value
   */
  histogram(name: string, value: number, tags?: Record<string, string>): void;

  /**
   * Gets all metrics
   */
  getMetrics(): AnyMetric[];

  /**
   * Gets metrics by name
   */
  getMetricsByName(name: string): AnyMetric[];

  /**
   * Clears all metrics
   */
  clear(): void;
}
