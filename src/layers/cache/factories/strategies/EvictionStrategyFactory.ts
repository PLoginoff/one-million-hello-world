/**
 * Eviction Strategy Factory
 *
 * Factory for creating eviction strategy instances.
 */

import { InvalidationStrategy } from '../../types/cache-types';
import { IEvictionStrategy } from '../../strategies/eviction/IEvictionStrategy';
import { LRUEvictionStrategy } from '../../strategies/eviction/LRUEvictionStrategy';
import { LFUEvictionStrategy } from '../../strategies/eviction/LFUEvictionStrategy';
import { FIFOEvictionStrategy } from '../../strategies/eviction/FIFOEvictionStrategy';
import { RandomEvictionStrategy } from '../../strategies/eviction/RandomEvictionStrategy';

export class EvictionStrategyFactory {
  static create<T>(strategy: InvalidationStrategy): IEvictionStrategy<T> {
    switch (strategy) {
      case InvalidationStrategy.LRU:
        return new LRUEvictionStrategy<T>();
      case InvalidationStrategy.LFU:
        return new LFUEvictionStrategy<T>();
      case InvalidationStrategy.FIFO:
        return new FIFOEvictionStrategy<T>();
      case InvalidationStrategy.RANDOM:
        return new RandomEvictionStrategy<T>();
      case InvalidationStrategy.TIME_BASED:
        return new LRUEvictionStrategy<T>();
      case InvalidationStrategy.MANUAL:
        return new RandomEvictionStrategy<T>();
      default:
        throw new Error(`Unsupported eviction strategy: ${String(strategy)}`);
    }
  }

  static getAvailableStrategies(): InvalidationStrategy[] {
    return [
      InvalidationStrategy.LRU,
      InvalidationStrategy.LFU,
      InvalidationStrategy.FIFO,
      InvalidationStrategy.RANDOM,
      InvalidationStrategy.TIME_BASED,
      InvalidationStrategy.MANUAL,
    ];
  }

  static isValidStrategy(strategy: unknown): boolean {
    return this.getAvailableStrategies().includes(strategy as InvalidationStrategy);
  }
}
