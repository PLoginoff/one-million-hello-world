/**
 * Cache Metrics
 *
 * Value object representing cache performance metrics.
 */

export class CacheMetrics {
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
  readonly size: number;

  constructor(hits: number, misses: number, evictions: number, size: number) {
    this.hits = hits;
    this.misses = misses;
    this.evictions = evictions;
    this.size = size;
  }

  getHitRate(): number {
    const total = this.getTotalRequests();
    return total > 0 ? this.hits / total : 0;
  }

  getMissRate(): number {
    const total = this.getTotalRequests();
    return total > 0 ? this.misses / total : 0;
  }

  getTotalRequests(): number {
    return this.hits + this.misses;
  }

  getEvictionRate(): number {
    const total = this.getTotalRequests();
    return total > 0 ? this.evictions / total : 0;
  }

  getEfficiency(): number {
    const total = this.getTotalRequests();
    if (total === 0) {
      return 0;
    }
    const hitRate = this.getHitRate();
    const evictionRate = this.getEvictionRate();
    return Math.max(0, Math.min(1, hitRate - evictionRate * 0.5));
  }

  toJSON(): Record<string, number> {
    return {
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      size: this.size,
      hitRate: this.getHitRate(),
      missRate: this.getMissRate(),
      totalRequests: this.getTotalRequests(),
      evictionRate: this.getEvictionRate(),
      efficiency: this.getEfficiency(),
    };
  }
}
