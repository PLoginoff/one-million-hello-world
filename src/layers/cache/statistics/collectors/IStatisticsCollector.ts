/**
 * Statistics Collector Interface
 * 
 * Defines contract for collecting cache statistics.
 */

import { CacheStats } from '../../domain/value-objects/CacheStats';

export interface IStatisticsCollector {
  /**
   * Record a cache hit
   */
  recordHit(): void;

  /**
   * Record a cache miss
   */
  recordMiss(): void;

  /**
   * Record an eviction
   */
  recordEviction(): void;

  /**
   * Update cache size
   */
  updateSize(size: number): void;

  /**
   * Get current statistics
   */
  getStats(): CacheStats;

  /**
   * Reset all statistics
   */
  reset(): void;

  /**
   * Get collector name
   */
  getName(): string;
}
