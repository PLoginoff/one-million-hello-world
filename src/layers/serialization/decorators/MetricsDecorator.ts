/**
 * Metrics Decorator
 * 
 * Decorator that adds metrics collection functionality to serialization strategies.
 */

import { ISerializationStrategy } from '../strategies/ISerializationStrategy';
import { ContentType } from '../types/serialization-types';

export interface IMetricsCollector {
  incrementCounter(name: string, value?: number): void;
  recordTiming(name: string, duration: number): void;
  recordGauge(name: string, value: number): void;
}

export class InMemoryMetricsCollector implements IMetricsCollector {
  private _counters: Map<string, number>;
  private _timings: Map<string, number[]>;
  private _gauges: Map<string, number>;

  constructor() {
    this._counters = new Map();
    this._timings = new Map();
    this._gauges = new Map();
  }

  incrementCounter(name: string, value: number = 1): void {
    const current = this._counters.get(name) ?? 0;
    this._counters.set(name, current + value);
  }

  recordTiming(name: string, duration: number): void {
    const timings = this._timings.get(name) ?? [];
    timings.push(duration);
    this._timings.set(name, timings);
  }

  recordGauge(name: string, value: number): void {
    this._gauges.set(name, value);
  }

  getCounter(name: string): number {
    return this._counters.get(name) ?? 0;
  }

  getTiming(name: string): number[] {
    return this._timings.get(name) ?? [];
  }

  getGauge(name: string): number {
    return this._gauges.get(name) ?? 0;
  }

  getAllCounters(): Map<string, number> {
    return new Map(this._counters);
  }

  getAllTimings(): Map<string, number[]> {
    return new Map(this._timings);
  }

  getAllGauges(): Map<string, number> {
    return new Map(this._gauges);
  }

  clear(): void {
    this._counters.clear();
    this._timings.clear();
    this._gauges.clear();
  }
}

export class MetricsDecorator implements ISerializationStrategy {
  private _strategy: ISerializationStrategy;
  private _metrics: IMetricsCollector;
  private _enabled: boolean;
  private _prefix: string;

  constructor(
    strategy: ISerializationStrategy,
    metrics?: IMetricsCollector,
    prefix: string = 'serialization'
  ) {
    this._strategy = strategy;
    this._metrics = metrics ?? new InMemoryMetricsCollector();
    this._enabled = true;
    this._prefix = prefix;
  }

  serialize(data: unknown): string {
    if (!this._enabled) {
      return this._strategy.serialize(data);
    }

    const startTime = Date.now();
    const dataSize = JSON.stringify(data).length;

    try {
      const result = this._strategy.serialize(data);
      const duration = Date.now() - startTime;

      this._metrics.incrementCounter(`${this._prefix}.serialize.count`);
      this._metrics.recordTiming(`${this._prefix}.serialize.duration`, duration);
      this._metrics.recordGauge(`${this._prefix}.serialize.data_size`, dataSize);
      this._metrics.recordGauge(`${this._prefix}.serialize.result_size`, result.length);

      return result;
    } catch (error) {
      this._metrics.incrementCounter(`${this._prefix}.serialize.errors`);
      throw error;
    }
  }

  deserialize(data: string): unknown {
    if (!this._enabled) {
      return this._strategy.deserialize(data);
    }

    const startTime = Date.now();
    const dataSize = data.length;

    try {
      const result = this._strategy.deserialize(data);
      const duration = Date.now() - startTime;

      this._metrics.incrementCounter(`${this._prefix}.deserialize.count`);
      this._metrics.recordTiming(`${this._prefix}.deserialize.duration`, duration);
      this._metrics.recordGauge(`${this._prefix}.deserialize.data_size`, dataSize);

      return result;
    } catch (error) {
      this._metrics.incrementCounter(`${this._prefix}.deserialize.errors`);
      throw error;
    }
  }

  getContentType(): ContentType {
    return this._strategy.getContentType();
  }

  getFormatName(): string {
    return this._strategy.getFormatName();
  }

  canSerialize(data: unknown): boolean {
    if (!this._enabled) {
      return this._strategy.canSerialize(data);
    }

    const result = this._strategy.canSerialize(data);
    this._metrics.incrementCounter(`${this._prefix}.can_serialize.count`);
    if (result) {
      this._metrics.incrementCounter(`${this._prefix}.can_serialize.success`);
    } else {
      this._metrics.incrementCounter(`${this._prefix}.can_serialize.failure`);
    }
    return result;
  }

  canDeserialize(data: string): boolean {
    if (!this._enabled) {
      return this._strategy.canDeserialize(data);
    }

    const result = this._strategy.canDeserialize(data);
    this._metrics.incrementCounter(`${this._prefix}.can_deserialize.count`);
    if (result) {
      this._metrics.incrementCounter(`${this._prefix}.can_deserialize.success`);
    } else {
      this._metrics.incrementCounter(`${this._prefix}.can_deserialize.failure`);
    }
    return result;
  }

  /**
   * Enables or disables metrics collection
   * 
   * @param enabled - Enable flag
   */
  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  /**
   * Checks if metrics collection is enabled
   * 
   * @returns True if enabled
   */
  isEnabled(): boolean {
    return this._enabled;
  }

  /**
   * Gets the underlying strategy
   * 
   * @returns Wrapped strategy
   */
  getStrategy(): ISerializationStrategy {
    return this._strategy;
  }

  /**
   * Gets the metrics collector
   * 
   * @returns Metrics collector
   */
  getMetrics(): IMetricsCollector {
    return this._metrics;
  }

  /**
   * Sets the metrics prefix
   * 
   * @param prefix - New prefix
   */
  setPrefix(prefix: string): void {
    this._prefix = prefix;
  }

  /**
   * Gets the metrics prefix
   * 
   * @returns Current prefix
   */
  getPrefix(): string {
    return this._prefix;
  }
}
