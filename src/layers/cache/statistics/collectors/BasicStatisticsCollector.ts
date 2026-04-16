/**
 * Basic Statistics Collector
 * 
 * Simple implementation of statistics collector.
 */

import { IStatisticsCollector } from './IStatisticsCollector';
import { CacheStats } from '../../domain/value-objects/CacheStats';

export class BasicStatisticsCollector implements IStatisticsCollector {
  private stats: CacheStats;

  constructor() {
    this.stats = new CacheStats();
  }

  recordHit(): void {
    this.stats = this.stats.withHit();
  }

  recordMiss(): void {
    this.stats = this.stats.withMiss();
  }

  recordEviction(): void {
    this.stats = this.stats.withEviction();
  }

  updateSize(size: number): void {
    this.stats = this.stats.withSize(size);
  }

  getStats(): CacheStats {
    return this.stats;
  }

  reset(): void {
    this.stats = this.stats.reset();
  }

  getName(): string {
    return 'BASIC';
  }
}
