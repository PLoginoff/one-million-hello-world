/**
 * Detailed Statistics Collector
 * 
 * Enhanced statistics collector with additional metrics.
 */

import { IStatisticsCollector } from './IStatisticsCollector';
import { CacheStats } from '../../domain/value-objects/CacheStats';

export class DetailedCacheStats extends CacheStats {
  readonly lastHitTime: number;
  readonly lastMissTime: number;
  readonly lastEvictionTime: number;
  readonly averageAccessTime: number;
  readonly peakSize: number;

  constructor(
    hits: number,
    misses: number,
    evictions: number,
    size: number,
    lastHitTime: number = 0,
    lastMissTime: number = 0,
    lastEvictionTime: number = 0,
    averageAccessTime: number = 0,
    peakSize: number = 0,
  ) {
    super(hits, misses, evictions, size);
    this.lastHitTime = lastHitTime;
    this.lastMissTime = lastMissTime;
    this.lastEvictionTime = lastEvictionTime;
    this.averageAccessTime = averageAccessTime;
    this.peakSize = peakSize;
  }
}

export class DetailedStatisticsCollector implements IStatisticsCollector {
  private stats: CacheStats;
  private lastHitTime: number;
  private lastMissTime: number;
  private lastEvictionTime: number;
  private accessTimes: number[];
  private peakSize: number;

  constructor() {
    this.stats = new CacheStats();
    this.lastHitTime = 0;
    this.lastMissTime = 0;
    this.lastEvictionTime = 0;
    this.accessTimes = [];
    this.peakSize = 0;
  }

  recordHit(): void {
    this.stats = this.stats.withHit();
    this.lastHitTime = Date.now();
    this.accessTimes.push(this.lastHitTime);
  }

  recordMiss(): void {
    this.stats = this.stats.withMiss();
    this.lastMissTime = Date.now();
  }

  recordEviction(): void {
    this.stats = this.stats.withEviction();
    this.lastEvictionTime = Date.now();
  }

  updateSize(size: number): void {
    this.stats = this.stats.withSize(size);
    if (size > this.peakSize) {
      this.peakSize = size;
    }
  }

  getStats(): CacheStats {
    return this.stats;
  }

  getDetailedStats(): DetailedCacheStats {
    return new DetailedCacheStats(
      this.stats.hits,
      this.stats.misses,
      this.stats.evictions,
      this.stats.size,
      this.lastHitTime,
      this.lastMissTime,
      this.lastEvictionTime,
      this.calculateAverageAccessTime(),
      this.peakSize,
    );
  }

  reset(): void {
    this.stats = this.stats.reset();
    this.lastHitTime = 0;
    this.lastMissTime = 0;
    this.lastEvictionTime = 0;
    this.accessTimes = [];
    this.peakSize = 0;
  }

  getName(): string {
    return 'DETAILED';
  }

  private calculateAverageAccessTime(): number {
    if (this.accessTimes.length === 0) return 0;
    const sum = this.accessTimes.reduce((a, b) => a + b, 0);
    return sum / this.accessTimes.length;
  }
}
