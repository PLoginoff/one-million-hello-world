/**
 * Metrics Registry
 * 
 * Central registry for metrics collectors.
 */

import { IMetricsCollector } from './IMetricsCollector';
import { InMemoryMetricsCollector } from './InMemoryMetricsCollector';

export class MetricsRegistry {
  private static _instance: MetricsRegistry;
  private _collectors: Map<string, IMetricsCollector>;

  private constructor() {
    this._collectors = new Map();
  }

  /**
   * Gets the singleton instance
   */
  static getInstance(): MetricsRegistry {
    if (!MetricsRegistry._instance) {
      MetricsRegistry._instance = new MetricsRegistry();
    }
    return MetricsRegistry._instance;
  }

  /**
   * Registers a metrics collector
   */
  register(name: string, collector: IMetricsCollector): void {
    this._collectors.set(name, collector);
  }

  /**
   * Unregisters a metrics collector
   */
  unregister(name: string): void {
    this._collectors.delete(name);
  }

  /**
   * Gets a metrics collector by name
   */
  get(name: string): IMetricsCollector | undefined {
    return this._collectors.get(name);
  }

  /**
   * Gets or creates a default metrics collector
   */
  getOrCreateDefault(name: string = 'default'): IMetricsCollector {
    if (!this._collectors.has(name)) {
      this._collectors.set(name, new InMemoryMetricsCollector());
    }
    return this._collectors.get(name)!;
  }

  /**
   * Gets all registered collector names
   */
  getCollectorNames(): string[] {
    return Array.from(this._collectors.keys());
  }

  /**
   * Clears all collectors
   */
  clear(): void {
    this._collectors.clear();
  }
}
