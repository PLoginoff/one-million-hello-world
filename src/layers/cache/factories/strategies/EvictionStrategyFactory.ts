/**
 * Eviction Strategy Factory
 * 
 * Factory for creating eviction strategy instances.
 */

import { IEvictionStrategy } from '../../strategies/eviction/IEvictionStrategy';
import { LRUEvictionStrategy } from '../../strategies/eviction/LRUEvictionStrategy';
import { LFUEvictionStrategy } from '../../strategies/eviction/LFUEvictionStrategy';
import { FIFOEvictionStrategy } from '../../strategies/eviction/FIFOEvictionStrategy';
import { RandomEvictionStrategy } from '../../strategies/eviction/RandomEvictionStrategy';
import { InvalidationStrategy } from '../../types/cache-types';

export class EvictionStrategyFactory {
  /**
   * Create eviction strategy by type
   */
  static create<T>(strategy: InvalidationStrategy): IEvictionStrategy<T> {
    switch (strategy) {
      case InvalidationStrategy.LRU:
        return new LRUEvictionStrategy<T>();
      case InvalidationStrategy.LFU:
        return new LFUEvictionStrategy<T>();
      case InvalidationStrategy.MANUAL:
        return new FIFOEvictionStrategy<T>();
      default:
        return new LRUEvictionStrategy<T>();
    }
  }

  /**
   * Create LRU strategy
   */
  static createLRU<T>(): IEvictionStrategy<T> {
    return new LRUEvictionStrategy<T>();
  }

  /**
   * Create LFU strategy
   */
  static createLFU<T>(): IEvictionStrategy<T> {
    return new LFUEvictionStrategy<T>();
  }

  /**
   * Create FIFO strategy
   */
  static createFIFO<T>(): IEvictionStrategy<T> {
    return new FIFOEvictionStrategy<T>();
  }

  /**
   * Create Random strategy
   */
  static createRandom<T>(): IEvictionStrategy<T> {
    return new RandomEvictionStrategy<T>();
  }

  /**
   * Get all available strategy names
   */
  static getAvailableStrategies(): string[] {
    return ['LRU', 'LFU', 'FIFO', 'RANDOM'];
  }
}
