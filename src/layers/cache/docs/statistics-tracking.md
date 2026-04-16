# Statistics Tracking

## Overview
The Cache Layer implements comprehensive statistics tracking including hit/miss counting, eviction counting, size tracking, and performance monitoring.

## Statistics Structure

### Cache Statistics
```typescript
interface CacheStatistics {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  maxSize: number;
  hitRate: number;
  averageAccessTime: number;
  lastUpdated: Date;
}

interface LevelStatistics {
  L1: CacheStatistics;
  L2: CacheStatistics;
  L3: CacheStatistics;
}
```

### Statistics Tracker
```typescript
class CacheStatisticsTracker {
  private stats: Map<CacheLevel, CacheStatistics> = new Map();
  
  constructor() {
    this.stats.set(CacheLevel.L1, this.createEmptyStats());
    this.stats.set(CacheLevel.L2, this.createEmptyStats());
    this.stats.set(CacheLevel.L3, this.createEmptyStats());
  }
  
  recordHit(level: CacheLevel, accessTime: number): void {
    const stats = this.stats.get(level);
    if (stats) {
      stats.hits++;
      this.updateAverageAccessTime(stats, accessTime);
      this.updateHitRate(stats);
      stats.lastUpdated = new Date();
    }
  }
  
  recordMiss(level: CacheLevel): void {
    const stats = this.stats.get(level);
    if (stats) {
      stats.misses++;
      this.updateHitRate(stats);
      stats.lastUpdated = new Date();
    }
  }
  
  recordEviction(level: CacheLevel): void {
    const stats = this.stats.get(level);
    if (stats) {
      stats.evictions++;
      stats.lastUpdated = new Date();
    }
  }
  
  updateSize(level: CacheLevel, size: number, maxSize: number): void {
    const stats = this.stats.get(level);
    if (stats) {
      stats.size = size;
      stats.maxSize = maxSize;
      stats.lastUpdated = new Date();
    }
  }
  
  getStatistics(level: CacheLevel): CacheStatistics {
    return { ...this.stats.get(level)! };
  }
  
  getAllStatistics(): LevelStatistics {
    return {
      L1: this.getStatistics(CacheLevel.L1),
      L2: this.getStatistics(CacheLevel.L2),
      L3: this.getStatistics(CacheLevel.L3)
    };
  }
  
  resetStatistics(level: CacheLevel): void {
    this.stats.set(level, this.createEmptyStats());
  }
  
  resetAllStatistics(): void {
    for (const level of [CacheLevel.L1, CacheLevel.L2, CacheLevel.L3]) {
      this.resetStatistics(level);
    }
  }
  
  private createEmptyStats(): CacheStatistics {
    return {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0,
      maxSize: 0,
      hitRate: 0,
      averageAccessTime: 0,
      lastUpdated: new Date()
    };
  }
  
  private updateAverageAccessTime(stats: CacheStatistics, accessTime: number): void {
    const totalAccesses = stats.hits + stats.misses;
    stats.averageAccessTime = 
      (stats.averageAccessTime * (totalAccesses - 1) + accessTime) / totalAccesses;
  }
  
  private updateHitRate(stats: CacheStatistics): void {
    const total = stats.hits + stats.misses;
    stats.hitRate = total > 0 ? stats.hits / total : 0;
  }
}
```

## Performance Monitoring

### Performance Monitor
```typescript
class CachePerformanceMonitor {
  private accessTimes: number[] = [];
  private maxSamples: number;
  
  constructor(maxSamples: number = 1000) {
    this.maxSamples = maxSamples;
  }
  
  recordAccess(time: number): void {
    this.accessTimes.push(time);
    
    if (this.accessTimes.length > this.maxSamples) {
      this.accessTimes.shift();
    }
  }
  
  getAverageAccessTime(): number {
    if (this.accessTimes.length === 0) return 0;
    
    const sum = this.accessTimes.reduce((a, b) => a + b, 0);
    return sum / this.accessTimes.length;
  }
  
  getMedianAccessTime(): number {
    if (this.accessTimes.length === 0) return 0;
    
    const sorted = [...this.accessTimes].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }
  
  getP95AccessTime(): number {
    if (this.accessTimes.length === 0) return 0;
    
    const sorted = [...this.accessTimes].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * 0.95);
    
    return sorted[index];
  }
  
  getP99AccessTime(): number {
    if (this.accessTimes.length === 0) return 0;
    
    const sorted = [...this.accessTimes].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * 0.99);
    
    return sorted[index];
  }
  
  clear(): void {
    this.accessTimes = [];
  }
}
```

## Statistics Aggregation

### Aggregated Statistics
```typescript
interface AggregatedCacheStatistics {
  totalHits: number;
  totalMisses: number;
  totalEvictions: number;
  totalSize: number;
  overallHitRate: number;
  levelBreakdown: LevelStatistics;
}

class StatisticsAggregator {
  aggregate(stats: LevelStatistics): AggregatedCacheStatistics {
    const totalHits = stats.L1.hits + stats.L2.hits + stats.L3.hits;
    const totalMisses = stats.L1.misses + stats.L2.misses + stats.L3.misses;
    const totalEvictions = stats.L1.evictions + stats.L2.evictions + stats.L3.evictions;
    const totalSize = stats.L1.size + stats.L2.size + stats.L3.size;
    const overallHitRate = (totalHits + totalMisses) > 0 
      ? totalHits / (totalHits + totalMisses) 
      : 0;
    
    return {
      totalHits,
      totalMisses,
      totalEvictions,
      totalSize,
      overallHitRate,
      levelBreakdown: stats
    };
  }
}
```

## Statistics Reporting

### Statistics Reporter
```typescript
class StatisticsReporter {
  generateReport(stats: AggregatedCacheStatistics): string {
    return `
Cache Statistics Report
======================
Total Hits: ${stats.totalHits}
Total Misses: ${stats.totalMisses}
Overall Hit Rate: ${(stats.overallHitRate * 100).toFixed(2)}%
Total Evictions: ${stats.totalEvictions}
Total Size: ${stats.totalSize}

Level Breakdown:
---------------
L1:
  Hits: ${stats.levelBreakdown.L1.hits}
  Misses: ${stats.levelBreakdown.L1.misses}
  Hit Rate: ${(stats.levelBreakdown.L1.hitRate * 100).toFixed(2)}%
  Size: ${stats.levelBreakdown.L1.size}/${stats.levelBreakdown.L1.maxSize}
  Evictions: ${stats.levelBreakdown.L1.evictions}

L2:
  Hits: ${stats.levelBreakdown.L2.hits}
  Misses: ${stats.levelBreakdown.L2.misses}
  Hit Rate: ${(stats.levelBreakdown.L2.hitRate * 100).toFixed(2)}%
  Size: ${stats.levelBreakdown.L2.size}/${stats.levelBreakdown.L2.maxSize}
  Evictions: ${stats.levelBreakdown.L2.evictions}

L3:
  Hits: ${stats.levelBreakdown.L3.hits}
  Misses: ${stats.levelBreakdown.L3.misses}
  Hit Rate: ${(stats.levelBreakdown.L3.hitRate * 100).toFixed(2)}%
  Size: ${stats.levelBreakdown.L3.size}/${stats.levelBreakdown.L3.maxSize}
  Evictions: ${stats.levelBreakdown.L3.evictions}
    `.trim();
  }
}
```

## Best Practices

### Statistics Collection Guidelines
- Record all cache operations
- Track access times for performance monitoring
- Monitor hit rates per level
- Track eviction rates
- Monitor cache size utilization

### Performance Monitoring Guidelines
- Use rolling window for access times
- Calculate percentiles (P95, P99)
- Monitor average access times
- Track performance trends
- Alert on performance degradation

### Reporting Guidelines
- Generate regular reports
- Include level breakdown
- Show trends over time
- Highlight performance issues
- Provide actionable insights
