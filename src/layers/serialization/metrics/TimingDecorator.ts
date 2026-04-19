/**
 * Timing Decorator
 * 
 * Decorator for timing function execution.
 */

import { IMetricsCollector } from './IMetricsCollector';

export class TimingDecorator {
  private _collector: IMetricsCollector;
  private _metricName: string;

  constructor(collector: IMetricsCollector, metricName: string) {
    this._collector = collector;
    this._metricName = metricName;
  }

  /**
   * Times a synchronous function
   */
  timeSync<T>(fn: () => T): T {
    const start = Date.now();
    try {
      const result = fn();
      const duration = Date.now() - start;
      this._collector.timing(this._metricName, duration);
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this._collector.timing(`${this._metricName}.error`, duration);
      throw error;
    }
  }

  /**
   * Times an asynchronous function
   */
  async timeAsync<T>(fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      this._collector.timing(this._metricName, duration);
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this._collector.timing(`${this._metricName}.error`, duration);
      throw error;
    }
  }

  /**
   * Creates a timing function
   */
  createTimingFunction<T>(fn: () => T): () => T {
    return () => this.timeSync(fn);
  }

  /**
   * Creates an async timing function
   */
  createAsyncTimingFunction<T>(fn: () => Promise<T>): () => Promise<T> {
    return () => this.timeAsync(fn);
  }
}
