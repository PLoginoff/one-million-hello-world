/**
 * Cache Metrics
 * 
 * Utility class for calculating cache performance metrics.
 */

import { CacheStats } from '../../domain/value-objects/CacheStats';

export class CacheMetrics {
  /**
   * Calculate hit rate percentage
   */
  static calculateHitRate(stats: CacheStats): number {
    return stats.getHitRate() * 100;
  }

  /**
   * Calculate miss rate percentage
   */
  static calculateMissRate(stats: CacheStats): number {
    return stats.getMissRate() * 100;
  }

  /**
   * Calculate efficiency score (0-100)
   * Combines hit rate and eviction rate
   */
  static calculateEfficiency(stats: CacheStats): number {
    const hitRate = stats.getHitRate();
    const evictionRate = stats.getTotalRequests() > 0 
      ? stats.evictions / stats.getTotalRequests() 
      : 0;
    
    return Math.max(0, Math.min(100, (hitRate * 100) - (evictionRate * 50)));
  }

  /**
   * Calculate memory efficiency
   * Based on hit rate vs cache size
   */
  static calculateMemoryEfficiency(stats: CacheStats): number {
    if (stats.size === 0) return 0;
    const hitRate = stats.getHitRate();
    const sizeEfficiency = Math.min(1, 1000 / stats.size);
    return hitRate * sizeEfficiency * 100;
  }

  /**
   * Get performance summary
   */
  static getPerformanceSummary(stats: CacheStats): string {
    const hitRate = this.calculateHitRate(stats);
    const efficiency = this.calculateEfficiency(stats);

    if (efficiency >= 80) return 'EXCELLENT';
    if (efficiency >= 60) return 'GOOD';
    if (efficiency >= 40) return 'FAIR';
    return 'POOR';
  }

  /**
   * Compare two stats and return improvement percentage
   */
  static compareStats(before: CacheStats, after: CacheStats): number {
    const beforeRate = before.getHitRate();
    const afterRate = after.getHitRate();

    if (beforeRate === 0) return afterRate > 0 ? 100 : 0;
    return ((afterRate - beforeRate) / beforeRate) * 100;
  }
}
