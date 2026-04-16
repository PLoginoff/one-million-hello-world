# Statistics Layer Documentation

## Overview

The Statistics Layer provides comprehensive cache performance tracking and metrics calculation. It offers both basic and detailed statistics collectors, along with utility functions for analyzing cache performance.

## Structure

```
statistics/
├── collectors/         # Statistics collectors
│   ├── IStatisticsCollector.ts
│   ├── BasicStatisticsCollector.ts
│   ├── DetailedStatisticsCollector.ts
│   └── index.ts
├── metrics/           # Metrics calculation utilities
│   ├── CacheMetrics.ts
│   └── index.ts
└── index.ts
```

## Statistics Collectors

### IStatisticsCollector Interface

Base interface for all statistics collectors.

```typescript
export interface IStatisticsCollector {
  recordHit(): void;
  recordMiss(): void;
  recordEviction(): void;
  updateSize(size: number): void;
  getStats(): CacheStats;
  reset(): void;
  getName(): string;
}
```

### BasicStatisticsCollector

Simple implementation with core metrics tracking.

```typescript
import { BasicStatisticsCollector } from '../statistics/collectors/BasicStatisticsCollector';

const collector = new BasicStatisticsCollector();

collector.recordHit();
collector.recordMiss();
collector.recordEviction();
collector.updateSize(100);

const stats = collector.getStats();
console.log(`Hits: ${stats.hits}, Misses: ${stats.misses}`);
```

**Tracked Metrics:**
- Hits
- Misses
- Evictions
- Current size

**Characteristics:**
- Minimal memory overhead
- Fast operations
- Core metrics only
- Suitable for production use

### DetailedStatisticsCollector

Enhanced implementation with additional metrics and timing information.

```typescript
import { DetailedStatisticsCollector, DetailedCacheStats } from '../statistics/collectors/DetailedStatisticsCollector';

const collector = new DetailedStatisticsCollector();

collector.recordHit();
collector.recordMiss();
collector.recordEviction();
collector.updateSize(100);

const stats = collector.getStats();
const detailedStats = collector.getDetailedStats();

console.log(`Last hit: ${detailedStats.lastHitTime}`);
console.log(`Peak size: ${detailedStats.peakSize}`);
console.log(`Average access time: ${detailedStats.averageAccessTime}`);
```

**Tracked Metrics:**
- All basic metrics
- Last hit time
- Last miss time
- Last eviction time
- Average access time
- Peak cache size

**Characteristics:**
- Additional memory overhead
- More detailed insights
- Better for analysis
- Suitable for development/testing

## Metrics Calculation

### CacheMetrics

Utility class for calculating derived metrics and performance indicators.

```typescript
import { CacheMetrics } from '../statistics/metrics/CacheMetrics';
import { CacheStats } from '../domain/value-objects/CacheStats';

const stats = new CacheStats(900, 100, 50, 500);

// Calculate hit rate percentage
const hitRate = CacheMetrics.calculateHitRate(stats); // 90.0

// Calculate miss rate percentage
const missRate = CacheMetrics.calculateMissRate(stats); // 10.0

// Calculate efficiency score (0-100)
const efficiency = CacheMetrics.calculateEfficiency(stats); // ~85

// Calculate memory efficiency
const memEfficiency = CacheMetrics.calculateMemoryEfficiency(stats);

// Get performance summary
const summary = CacheMetrics.getPerformanceSummary(stats); // 'EXCELLENT'

// Compare stats
const before = new CacheStats(800, 200, 30, 400);
const after = new CacheStats(900, 100, 50, 500);
const improvement = CacheMetrics.compareStats(before, after); // 12.5%
```

### Metric Calculations

#### Hit Rate

Percentage of cache requests that result in a hit.

```typescript
const hitRate = CacheMetrics.calculateHitRate(stats); // 0-100
```

#### Miss Rate

Percentage of cache requests that result in a miss.

```typescript
const missRate = CacheMetrics.calculateMissRate(stats); // 0-100
```

#### Efficiency Score

Combined score considering hit rate and eviction rate (0-100).

```typescript
const efficiency = CacheMetrics.calculateEfficiency(stats);
// Higher is better (90+ = Excellent, 60-89 = Good, 40-59 = Fair, <40 = Poor)
```

#### Memory Efficiency

Ratio of hit rate to cache size utilization.

```typescript
const memEfficiency = CacheMetrics.calculateMemoryEfficiency(stats);
// Higher is better
```

#### Performance Summary

Textual summary of cache performance.

```typescript
const summary = CacheMetrics.getPerformanceSummary(stats);
// Returns: 'EXCELLENT', 'GOOD', 'FAIR', or 'POOR'
```

#### Comparison

Compare two statistics to calculate improvement percentage.

```typescript
const improvement = CacheMetrics.compareStats(before, after);
// Returns percentage improvement (can be negative)
```

## Usage Examples

### Basic Statistics Tracking

```typescript
import { BasicStatisticsCollector } from '../statistics/collectors/BasicStatisticsCollector';

const collector = new BasicStatisticsCollector();

// In cache operations
if (cacheHit) {
  collector.recordHit();
} else {
  collector.recordMiss();
}

// On eviction
collector.recordEviction();

// Update size
collector.updateSize(cache.size);

// Get stats
const stats = collector.getStats();
console.log(`Hit rate: ${(stats.getHitRate() * 100).toFixed(2)}%`);
```

### Detailed Statistics Tracking

```typescript
import { DetailedStatisticsCollector } from '../statistics/collectors/DetailedStatisticsCollector';

const collector = new DetailedStatisticsCollector();

// Track operations
collector.recordHit();
collector.recordMiss();

// Get detailed stats
const detailed = collector.getDetailedStats();
console.log(`Peak size: ${detailed.peakSize}`);
console.log(`Last hit: ${new Date(detailed.lastHitTime).toISOString()}`);
```

### Performance Analysis

```typescript
import { CacheMetrics } from '../statistics/metrics/CacheMetrics';

const stats = collector.getStats();

const hitRate = CacheMetrics.calculateHitRate(stats);
const efficiency = CacheMetrics.calculateEfficiency(stats);
const summary = CacheMetrics.getPerformanceSummary(stats);

console.log(`Hit Rate: ${hitRate.toFixed(2)}%`);
console.log(`Efficiency: ${efficiency.toFixed(2)}/100`);
console.log(`Performance: ${summary}`);
```

### Comparing Performance

```typescript
// Before optimization
const beforeStats = collector.getStats();

// ... apply optimization ...

// After optimization
const afterStats = collector.getStats();

const improvement = CacheMetrics.compareStats(beforeStats, afterStats);
console.log(`Improvement: ${improvement.toFixed(2)}%`);
```

## Integration with Cache

### Using with CacheService

```typescript
import { CacheService } from '../core/services/CacheService';
import { BasicStatisticsCollector } from '../statistics/collectors/BasicStatisticsCollector';

const statsCollector = new BasicStatisticsCollector();
const cacheService = new CacheService(
  storage,
  evictionStrategy,
  invalidationStrategy,
  statsCollector,
  config
);

// Statistics are automatically tracked
const result = cacheService.get('key');
const stats = cacheService.getStats();
```

### Using with CacheManager

```typescript
import { CacheManager } from '../core/managers/CacheManager';

const cache = new CacheManager<string>();

// Operations automatically track statistics
cache.set('key', 'value');
cache.get('key');

// Get statistics
const stats = cache.getStats();
console.log(`Hit rate: ${(stats.getHitRate() * 100).toFixed(2)}%`);
```

## Statistics Monitoring

### Real-time Monitoring

```typescript
// Set up periodic monitoring
setInterval(() => {
  const stats = cache.getStats();
  const hitRate = CacheMetrics.calculateHitRate(stats);
  const efficiency = CacheMetrics.calculateEfficiency(stats);
  
  console.log(`Hit Rate: ${hitRate.toFixed(2)}%`);
  console.log(`Efficiency: ${efficiency.toFixed(2)}/100`);
  console.log(`Size: ${stats.size}`);
}, 60000); // Every minute
```

### Alerting

```typescript
// Set up alerting for poor performance
const stats = cache.getStats();
const efficiency = CacheMetrics.calculateEfficiency(stats);

if (efficiency < 40) {
  console.warn('Cache performance is POOR');
  // Send alert, adjust configuration, etc.
}
```

## Performance Considerations

### Basic vs Detailed

| Aspect | Basic | Detailed |
|--------|-------|----------|
| Memory | O(1) | O(n) |
| Overhead | Minimal | Moderate |
| Metrics | Core | Comprehensive |
| Use Case | Production | Development/Analysis |

### Overhead Analysis

- **recordHit()**: O(1) for both collectors
- **recordMiss()**: O(1) for both collectors
- **recordEviction()**: O(1) for both collectors
- **updateSize()**: O(1) for both collectors
- **getStats()**: O(1) for both collectors

## Testing Statistics

```typescript
describe('BasicStatisticsCollector', () => {
  it('should track hits and misses', () => {
    const collector = new BasicStatisticsCollector();
    
    collector.recordHit();
    collector.recordMiss();
    
    const stats = collector.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });

  it('should calculate hit rate correctly', () => {
    const collector = new BasicStatisticsCollector();
    
    collector.recordHit();
    collector.recordHit();
    collector.recordMiss();
    
    const stats = collector.getStats();
    expect(stats.getHitRate()).toBe(0.666); // 2/3
  });
});
```

## Best Practices

1. **Use Basic in production**: Minimal overhead for production systems
2. **Use Detailed for analysis**: Gather detailed data during development/testing
3. **Monitor regularly**: Set up periodic monitoring of cache performance
4. **Set alerts**: Alert on poor performance metrics
5. **Compare before/after**: Measure impact of configuration changes
6. **Reset periodically**: Reset statistics to get fresh baselines
7. **Export for analysis**: Export statistics for long-term analysis

## Statistics Export

### JSON Export

```typescript
const stats = collector.getStats();
const json = stats.toJSON();

// Save to file, send to monitoring system, etc.
fs.writeFileSync('cache-stats.json', JSON.stringify(json, null, 2));
```

### CSV Export

```typescript
const stats = collector.getStats();
const csv = `
timestamp,hits,misses,evictions,size,hit_rate,miss_rate
${Date.now()},${stats.hits},${stats.misses},${stats.evictions},${stats.size},${stats.getHitRate()},${stats.getMissRate()}
`;
```

## Integration with Monitoring Systems

### Prometheus-style Metrics

```typescript
const stats = collector.getStats();

// Export as Prometheus metrics
const metrics = `
cache_hits_total ${stats.hits}
cache_misses_total ${stats.misses}
cache_evictions_total ${stats.evictions}
cache_size ${stats.size}
cache_hit_rate ${stats.getHitRate()}
`;
```

### StatsD-style Metrics

```typescript
const stats = collector.getStats();

// Send to StatsD
statsd.gauge('cache.hits', stats.hits);
statsd.gauge('cache.misses', stats.misses);
statsd.gauge('cache.evictions', stats.evictions);
statsd.gauge('cache.size', stats.size);
statsd.gauge('cache.hit_rate', stats.getHitRate());
```
