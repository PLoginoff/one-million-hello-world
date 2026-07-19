/**
 * Cache Metrics Collector
 */

import { IStatisticsCollector } from '../statistics/collectors/IStatisticsCollector';

export interface CacheMetrics {
  cacheHitsTotal: number;
  cacheMissesTotal: number;
  cacheHitRate: number;
  cacheMissRate: number;
  cacheEvictionsTotal: number;
  cacheSize: number;
  cacheTotalRequests: number;
  collectedAt: number;
}

export interface CacheMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class CacheMetricsCollector {
  private readonly _collector: IStatisticsCollector;
  private _collectionCount: number;

  constructor(collector: IStatisticsCollector) {
    this._collector = collector;
    this._collectionCount = 0;
  }

  collect(): CacheMetrics {
    const stats = this._collector.getStats();
    this._collectionCount++;
    return {
      cacheHitsTotal: stats.hits,
      cacheMissesTotal: stats.misses,
      cacheHitRate: stats.getHitRate(),
      cacheMissRate: stats.getMissRate(),
      cacheEvictionsTotal: stats.evictions,
      cacheSize: stats.size,
      cacheTotalRequests: stats.getTotalRequests(),
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): CacheMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'cache_hits_total', value: m.cacheHitsTotal, labels: {}, timestamp: ts },
      { name: 'cache_misses_total', value: m.cacheMissesTotal, labels: {}, timestamp: ts },
      { name: 'cache_hit_rate', value: m.cacheHitRate, labels: {}, timestamp: ts },
      { name: 'cache_miss_rate', value: m.cacheMissRate, labels: {}, timestamp: ts },
      { name: 'cache_evictions_total', value: m.cacheEvictionsTotal, labels: {}, timestamp: ts },
      { name: 'cache_size', value: m.cacheSize, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP cache_hits_total Total cache hits',
      '# TYPE cache_hits_total counter',
      '# HELP cache_misses_total Total cache misses',
      '# TYPE cache_misses_total counter',
      '# HELP cache_hit_rate Cache hit rate (0-1)',
      '# TYPE cache_hit_rate gauge',
      '# HELP cache_miss_rate Cache miss rate (0-1)',
      '# TYPE cache_miss_rate gauge',
      '# HELP cache_evictions_total Total cache evictions',
      '# TYPE cache_evictions_total counter',
      '# HELP cache_size Current cache size',
      '# TYPE cache_size gauge',
    ];

    for (const s of samples) {
      lines.push(`${s.name} ${s.value} ${s.timestamp}`);
    }

    return lines.join('\n') + '\n';
  }

  getCollectionCount(): number {
    return this._collectionCount;
  }
}
