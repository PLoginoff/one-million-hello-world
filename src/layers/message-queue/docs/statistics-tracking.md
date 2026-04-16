# Statistics Tracking

## Overview
The Message Queue Layer implements comprehensive statistics tracking including queued message count, processed message count, failed message count, and dead letter count.

## Statistics Structure

### Queue Statistics
```typescript
interface QueueStatistics {
  queuedCount: number;
  processedCount: number;
  failedCount: number;
  deadLetterCount: number;
  processingRate: number;
  averageProcessingTime: number;
  lastProcessedAt: Date | null;
}
```

### Statistics Tracker
```typescript
class QueueStatisticsTracker {
  private stats: QueueStatistics;
  private processingTimes: number[] = [];
  
  constructor() {
    this.stats = {
      queuedCount: 0,
      processedCount: 0,
      failedCount: 0,
      deadLetterCount: 0,
      processingRate: 0,
      averageProcessingTime: 0,
      lastProcessedAt: null
    };
  }
  
  updateQueuedCount(count: number): void {
    this.stats.queuedCount = count;
  }
  
  recordProcessed(processingTime: number): void {
    this.stats.processedCount++;
    this.stats.lastProcessedAt = new Date();
    
    this.processingTimes.push(processingTime);
    
    if (this.processingTimes.length > 1000) {
      this.processingTimes.shift();
    }
    
    this.updateAverageProcessingTime();
    this.updateProcessingRate();
  }
  
  recordFailed(): void {
    this.stats.failedCount++;
  }
  
  updateDeadLetterCount(count: number): void {
    this.stats.deadLetterCount = count;
  }
  
  private updateAverageProcessingTime(): void {
    if (this.processingTimes.length === 0) {
      this.stats.averageProcessingTime = 0;
      return;
    }
    
    const sum = this.processingTimes.reduce((a, b) => a + b, 0);
    this.stats.averageProcessingTime = sum / this.processingTimes.length;
  }
  
  private updateProcessingRate(): void {
    if (!this.stats.lastProcessedAt) {
      this.stats.processingRate = 0;
      return;
    }
    
    const elapsed = Date.now() - this.stats.lastProcessedAt.getTime();
    this.stats.processingRate = this.stats.processedCount / (elapsed / 1000);
  }
  
  getStatistics(): QueueStatistics {
    return {
      queuedCount: this.stats.queuedCount,
      processedCount: this.stats.processedCount,
      failedCount: this.stats.failedCount,
      deadLetterCount: this.stats.deadLetterCount,
      processingRate: this.stats.processingRate,
      averageProcessingTime: this.stats.averageProcessingTime,
      lastProcessedAt: this.stats.lastProcessedAt
    };
  }
  
  reset(): void {
    this.stats = {
      queuedCount: 0,
      processedCount: 0,
      failedCount: 0,
      deadLetterCount: 0,
      processingRate: 0,
      averageProcessingTime: 0,
      lastProcessedAt: null
    };
    this.processingTimes = [];
  }
}
```

## Performance Monitoring

### Performance Metrics
```typescript
interface PerformanceMetrics {
  p50ProcessingTime: number;
  p95ProcessingTime: number;
  p99ProcessingTime: number;
  throughput: number;
  errorRate: number;
}

class PerformanceMonitor {
  private processingTimes: number[] = [];
  private maxSamples: number;
  
  constructor(maxSamples: number = 1000) {
    this.maxSamples = maxSamples;
  }
  
  recordProcessingTime(time: number): void {
    this.processingTimes.push(time);
    
    if (this.processingTimes.length > this.maxSamples) {
      this.processingTimes.shift();
    }
  }
  
  getMetrics(stats: QueueStatistics): PerformanceMetrics {
    return {
      p50ProcessingTime: this.calculatePercentile(0.50),
      p95ProcessingTime: this.calculatePercentile(0.95),
      p99ProcessingTime: this.calculatePercentile(0.99),
      throughput: stats.processingRate,
      errorRate: stats.failedCount / (stats.processedCount + stats.failedCount)
    };
  }
  
  private calculatePercentile(percentile: number): number {
    if (this.processingTimes.length === 0) return 0;
    
    const sorted = [...this.processingTimes].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * percentile);
    
    return sorted[index];
  }
  
  clear(): void {
    this.processingTimes = [];
  }
}
```

## Statistics Reporting

### Statistics Reporter
```typescript
class StatisticsReporter {
  generateReport(stats: QueueStatistics, metrics: PerformanceMetrics): string {
    return `
Message Queue Statistics Report
===============================
Queue Status:
  Queued: ${stats.queuedCount}
  Processed: ${stats.processedCount}
  Failed: ${stats.failedCount}
  Dead Letters: ${stats.deadLetterCount}

Performance Metrics:
  Processing Rate: ${stats.processingRate.toFixed(2)} msg/s
  Average Processing Time: ${stats.averageProcessingTime.toFixed(2)}ms
  P50 Processing Time: ${metrics.p50ProcessingTime.toFixed(2)}ms
  P95 Processing Time: ${metrics.p95ProcessingTime.toFixed(2)}ms
  P99 Processing Time: ${metrics.p99ProcessingTime.toFixed(2)}ms
  Throughput: ${metrics.throughput.toFixed(2)} msg/s
  Error Rate: ${(metrics.errorRate * 100).toFixed(2)}%

Last Processed: ${stats.lastProcessedAt?.toISOString() || 'N/A'}
    `.trim();
  }
}
```

## Best Practices

### Statistics Collection Guidelines
- Record all message operations
- Track processing times
- Monitor queue depth
- Track error rates
- Monitor dead letter queue

### Performance Monitoring Guidelines
- Use rolling window for metrics
- Calculate percentiles (P50, P95, P99)
- Monitor throughput
- Track error rates
- Monitor processing trends

### Reporting Guidelines
- Generate regular reports
- Include performance metrics
- Highlight queue depth
- Show error patterns
- Provide actionable insights
