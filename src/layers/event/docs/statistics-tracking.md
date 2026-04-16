# Statistics Tracking

## Overview
The Event Layer implements comprehensive statistics tracking including publish count tracking, handler count tracking, error count tracking, and subscription count tracking.

## Statistics Structure

### Event Bus Statistics
```typescript
interface EventBusStatistics {
  totalPublishes: number;
  publishesByEventType: Map<string, number>;
  totalHandlers: number;
  handlersByEventType: Map<string, number>;
  totalErrors: number;
  totalSubscriptions: number;
  subscriptionsByEventType: Map<string, number>;
  lastPublishTime: Date | null;
  lastErrorTime: Date | null;
}
```

### Statistics Tracker
```typescript
class EventBusStatisticsTracker {
  private stats: EventBusStatistics;
  
  constructor() {
    this.stats = {
      totalPublishes: 0,
      publishesByEventType: new Map(),
      totalHandlers: 0,
      handlersByEventType: new Map(),
      totalErrors: 0,
      totalSubscriptions: 0,
      subscriptionsByEventType: new Map(),
      lastPublishTime: null,
      lastErrorTime: null
    };
  }
  
  recordPublish(eventType: string): void {
    this.stats.totalPublishes++;
    this.stats.lastPublishTime = new Date();
    
    const count = this.stats.publishesByEventType.get(eventType) || 0;
    this.stats.publishesByEventType.set(eventType, count + 1);
  }
  
  recordHandler(eventType: string): void {
    this.stats.totalHandlers++;
    
    const count = this.stats.handlersByEventType.get(eventType) || 0;
    this.stats.handlersByEventType.set(eventType, count + 1);
  }
  
  recordError(): void {
    this.stats.totalErrors++;
    this.stats.lastErrorTime = new Date();
  }
  
  recordSubscription(eventType: string): void {
    this.stats.totalSubscriptions++;
    
    const count = this.stats.subscriptionsByEventType.get(eventType) || 0;
    this.stats.subscriptionsByEventType.set(eventType, count + 1);
  }
  
  recordUnsubscription(eventType: string): void {
    this.stats.totalSubscriptions--;
    
    const count = this.stats.subscriptionsByEventType.get(eventType) || 0;
    if (count > 0) {
      this.stats.subscriptionsByEventType.set(eventType, count - 1);
    }
  }
  
  getStatistics(): EventBusStatistics {
    return {
      totalPublishes: this.stats.totalPublishes,
      publishesByEventType: new Map(this.stats.publishesByEventType),
      totalHandlers: this.stats.totalHandlers,
      handlersByEventType: new Map(this.stats.handlersByEventType),
      totalErrors: this.stats.totalErrors,
      totalSubscriptions: this.stats.totalSubscriptions,
      subscriptionsByEventType: new Map(this.stats.subscriptionsByEventType),
      lastPublishTime: this.stats.lastPublishTime,
      lastErrorTime: this.stats.lastErrorTime
    };
  }
  
  reset(): void {
    this.stats = {
      totalPublishes: 0,
      publishesByEventType: new Map(),
      totalHandlers: 0,
      handlersByEventType: new Map(),
      totalErrors: 0,
      totalSubscriptions: 0,
      subscriptionsByEventType: new Map(),
      lastPublishTime: null,
      lastErrorTime: null
    };
  }
}
```

## Performance Monitoring

### Performance Tracker
```typescript
interface PerformanceMetrics {
  averagePublishTime: number;
  averageHandlerExecutionTime: number;
  p95PublishTime: number;
  p99PublishTime: number;
  p95HandlerExecutionTime: number;
  p99HandlerExecutionTime: number;
}

class PerformanceTracker {
  private publishTimes: number[] = [];
  private handlerExecutionTimes: number[] = [];
  private maxSamples: number;
  
  constructor(maxSamples: number = 1000) {
    this.maxSamples = maxSamples;
  }
  
  recordPublishTime(time: number): void {
    this.publishTimes.push(time);
    
    if (this.publishTimes.length > this.maxSamples) {
      this.publishTimes.shift();
    }
  }
  
  recordHandlerExecutionTime(time: number): void {
    this.handlerExecutionTimes.push(time);
    
    if (this.handlerExecutionTimes.length > this.maxSamples) {
      this.handlerExecutionTimes.shift();
    }
  }
  
  getMetrics(): PerformanceMetrics {
    return {
      averagePublishTime: this.calculateAverage(this.publishTimes),
      averageHandlerExecutionTime: this.calculateAverage(this.handlerExecutionTimes),
      p95PublishTime: this.calculatePercentile(this.publishTimes, 0.95),
      p99PublishTime: this.calculatePercentile(this.publishTimes, 0.99),
      p95HandlerExecutionTime: this.calculatePercentile(this.handlerExecutionTimes, 0.95),
      p99HandlerExecutionTime: this.calculatePercentile(this.handlerExecutionTimes, 0.99)
    };
  }
  
  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    const sum = values.reduce((a, b) => a + b, 0);
    return sum / values.length;
  }
  
  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * percentile);
    
    return sorted[index];
  }
  
  clear(): void {
    this.publishTimes = [];
    this.handlerExecutionTimes = [];
  }
}
```

## Statistics Aggregation

### Statistics Reporter
```typescript
class StatisticsReporter {
  generateReport(stats: EventBusStatistics, metrics: PerformanceMetrics): string {
    return `
Event Bus Statistics Report
============================
Total Publishes: ${stats.totalPublishes}
Total Handlers: ${stats.totalHandlers}
Total Errors: ${stats.totalErrors}
Total Subscriptions: ${stats.totalSubscriptions}

Publishes by Event Type:
${this.formatMap(stats.publishesByEventType)}

Handlers by Event Type:
${this.formatMap(stats.handlersByEventType)}

Subscriptions by Event Type:
${this.formatMap(stats.subscriptionsByEventType)}

Performance Metrics:
Average Publish Time: ${metrics.averagePublishTime.toFixed(2)}ms
Average Handler Execution Time: ${metrics.averageHandlerExecutionTime.toFixed(2)}ms
P95 Publish Time: ${metrics.p95PublishTime.toFixed(2)}ms
P99 Publish Time: ${metrics.p99PublishTime.toFixed(2)}ms
P95 Handler Execution Time: ${metrics.p95HandlerExecutionTime.toFixed(2)}ms
P99 Handler Execution Time: ${metrics.p99HandlerExecutionTime.toFixed(2)}ms

Last Publish: ${stats.lastPublishTime?.toISOString() || 'N/A'}
Last Error: ${stats.lastErrorTime?.toISOString() || 'N/A'}
    `.trim();
  }
  
  private formatMap(map: Map<string, number>): string {
    const entries = Array.from(map.entries());
    if (entries.length === 0) return '  None';
    
    return entries.map(([key, value]) => `  ${key}: ${value}`).join('\n');
  }
}
```

## Best Practices

### Statistics Collection Guidelines
- Record all publishes
- Track errors by event type
- Track handlers by event type
- Monitor subscription counts
- Track performance metrics

### Performance Monitoring Guidelines
- Use rolling window for metrics
- Calculate percentiles (P95, P99)
- Monitor average execution times
- Track performance trends
- Alert on performance degradation

### Reporting Guidelines
- Generate regular reports
- Include breakdown by event type
- Show performance metrics
- Highlight error patterns
- Provide actionable insights
