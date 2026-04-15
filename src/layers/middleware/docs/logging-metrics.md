# Logging and Metrics

## Overview
The Middleware Layer provides comprehensive logging and metrics capabilities for observability and monitoring. Logging includes structured entries with categories, levels, and metadata. Metrics include counters, gauges, histograms, and summaries with aggregation support.

## Advanced Logging

### Log Levels
```typescript
enum LogLevel {
  TRACE = 'trace',
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal'
}
```

### Log Categories
```typescript
enum LogCategory {
  GENERAL = 'general',
  HTTP = 'http',
  DATABASE = 'database',
  CACHE = 'cache',
  SECURITY = 'security',
  PERFORMANCE = 'performance',
  BUSINESS = 'business',
  SYSTEM = 'system'
}
```

### Log Entry Structure
```typescript
interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  category: LogCategory;
  message: string;
  metadata?: Map<string, any>;
  requestId?: string;
  userId?: string;
  traceId?: string;
  spanId?: string;
}
```

### Logger Implementation
```typescript
class Logger {
  private logs: LogEntry[] = [];
  private config: LoggingConfig;
  
  log(level: LogLevel, category: LogCategory, message: string, metadata?: Map<string, any>): void {
    if (!this.shouldLog(level, category)) {
      return;
    }
    
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      category,
      message,
      metadata,
      requestId: this.correlationManager.getRequestId(),
      traceId: this.correlationManager.getTraceId(),
      spanId: this.correlationManager.getSpanId()
    };
    
    this.logs.push(entry);
    this.output(entry);
  }
  
  private shouldLog(level: LogLevel, category: LogCategory): boolean {
    const configuredLevel = this.config.categoryLevels.get(category) || this.config.defaultLevel;
    return this.getLevelValue(level) >= this.getLevelValue(configuredLevel);
  }
  
  private getLevelValue(level: LogLevel): number {
    const values = {
      [LogLevel.TRACE]: 0,
      [LogLevel.DEBUG]: 1,
      [LogLevel.INFO]: 2,
      [LogLevel.WARN]: 3,
      [LogLevel.ERROR]: 4,
      [LogLevel.FATAL]: 5
    };
    return values[level];
  }
  
  private output(entry: LogEntry): void {
    const formatted = this.formatEntry(entry);
    
    switch (this.config.outputTarget) {
      case LogOutputTarget.CONSOLE:
        console.log(formatted);
        break;
      case LogOutputTarget.FILE:
        this.writeToFile(formatted);
        break;
      case LogOutputTarget.REMOTE:
        this.sendToRemote(entry);
        break;
      case LogOutputTarget.BOTH:
        console.log(formatted);
        this.writeToFile(formatted);
        break;
    }
  }
  
  private formatEntry(entry: LogEntry): string {
    switch (this.config.outputFormat) {
      case LogOutputFormat.JSON:
        return JSON.stringify(entry);
      case LogOutputFormat.TEXT:
        return `[${entry.timestamp.toISOString()}] [${entry.level.toUpperCase()}] [${entry.category}] ${entry.message}`;
      case LogOutputFormat.PRETTY:
        return this.prettyFormat(entry);
    }
  }
}
```

### Log Filtering
```typescript
interface LogFilter {
  level?: LogLevel;
  category?: LogCategory;
  startTime?: Date;
  endTime?: Date;
  messagePattern?: string;
  limit?: number;
}

class LogFilter {
  filter(logs: LogEntry[], filter: LogFilter): LogEntry[] {
    let result = [...logs];
    
    if (filter.level) {
      result = result.filter(log => log.level === filter.level);
    }
    
    if (filter.category) {
      result = result.filter(log => log.category === filter.category);
    }
    
    if (filter.startTime) {
      result = result.filter(log => log.timestamp >= filter.startTime);
    }
    
    if (filter.endTime) {
      result = result.filter(log => log.timestamp <= filter.endTime);
    }
    
    if (filter.messagePattern) {
      const pattern = new RegExp(filter.messagePattern, 'i');
      result = result.filter(log => pattern.test(log.message));
    }
    
    if (filter.limit) {
      result = result.slice(-filter.limit);
    }
    
    return result;
  }
}
```

### Log Aggregation
```typescript
interface LogAggregation {
  totalLogs: number;
  logsByLevel: Map<LogLevel, number>;
  topMessages: Array<{ message: string; count: number }>;
}

class LogAggregator {
  aggregate(logs: LogEntry[]): LogAggregation {
    const logsByLevel = new Map<LogLevel, number>();
    const messageCounts = new Map<string, number>();
    
    for (const log of logs) {
      const levelCount = logsByLevel.get(log.level) || 0;
      logsByLevel.set(log.level, levelCount + 1);
      
      const messageCount = messageCounts.get(log.message) || 0;
      messageCounts.set(log.message, messageCount + 1);
    }
    
    const topMessages = Array.from(messageCounts.entries())
      .map(([message, count]) => ({ message, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    return {
      totalLogs: logs.length,
      logsByLevel,
      topMessages
    };
  }
}
```

## Advanced Metrics

### Metric Types
```typescript
enum MetricType {
  COUNTER = 'counter',
  GAUGE = 'gauge',
  HISTOGRAM = 'histogram',
  SUMMARY = 'summary'
}
```

### Metric Entry Structure
```typescript
interface MetricEntry {
  name: string;
  type: MetricType;
  value: number;
  labels: Map<string, string>;
  timestamp: Date;
}
```

### Metrics Collector
```typescript
class MetricsCollector {
  private metrics: MetricEntry[] = [];
  private config: MetricsConfig;
  
  increment(name: string, value: number, labels?: Map<string, string>): void {
    const entry: MetricEntry = {
      name,
      type: MetricType.COUNTER,
      value,
      labels: labels || new Map(),
      timestamp: new Date()
    };
    
    this.metrics.push(entry);
  }
  
  set(name: string, value: number, labels?: Map<string, string>): void {
    const entry: MetricEntry = {
      name,
      type: MetricType.GAUGE,
      value,
      labels: labels || new Map(),
      timestamp: new Date()
    };
    
    this.metrics.push(entry);
  }
  
  observe(name: string, value: number, labels?: Map<string, string>): void {
    const entry: MetricEntry = {
      name,
      type: MetricType.HISTOGRAM,
      value,
      labels: labels || new Map(),
      timestamp: new Date()
    };
    
    this.metrics.push(entry);
  }
  
  timing(name: string, duration: number, labels?: Map<string, string>): void {
    const entry: MetricEntry = {
      name,
      type: MetricType.SUMMARY,
      value: duration,
      labels: labels || new Map(),
      timestamp: new Date()
    };
    
    this.metrics.push(entry);
  }
}
```

### Metric Aggregation Types
```typescript
enum AggregationType {
  SUM = 'sum',
  AVG = 'avg',
  MIN = 'min',
  MAX = 'max',
  COUNT = 'count',
  P50 = 'p50',
  P95 = 'p95',
  P99 = 'p99'
}
```

### Metric Statistics
```typescript
interface MetricStatistics {
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
}

class MetricStatisticsCalculator {
  calculate(metrics: MetricEntry[]): MetricStatistics {
    const values = metrics.map(m => m.value);
    
    if (values.length === 0) {
      return {
        count: 0,
        sum: 0,
        avg: 0,
        min: 0,
        max: 0,
        p50: 0,
        p95: 0,
        p99: 0
      };
    }
    
    const sorted = [...values].sort((a, b) => a - b);
    
    return {
      count: values.length,
      sum: values.reduce((a, b) => a + b, 0),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p50: this.percentile(sorted, 50),
      p95: this.percentile(sorted, 95),
      p99: this.percentile(sorted, 99)
    };
  }
  
  private percentile(sorted: number[], p: number): number {
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}
```

### Metric Filtering
```typescript
interface MetricFilter {
  name?: string;
  type?: MetricType;
  labels?: Map<string, string>;
  startTime?: Date;
  endTime?: Date;
}

class MetricFilter {
  filter(metrics: MetricEntry[], filter: MetricFilter): MetricEntry[] {
    let result = [...metrics];
    
    if (filter.name) {
      const pattern = new RegExp(filter.name, 'i');
      result = result.filter(m => pattern.test(m.name));
    }
    
    if (filter.type) {
      result = result.filter(m => m.type === filter.type);
    }
    
    if (filter.labels) {
      for (const [key, value] of filter.labels) {
        result = result.filter(m => m.labels.get(key) === value);
      }
    }
    
    if (filter.startTime) {
      result = result.filter(m => m.timestamp >= filter.startTime);
    }
    
    if (filter.endTime) {
      result = result.filter(m => m.timestamp <= filter.endTime);
    }
    
    return result;
  }
}
```

### Metric Aggregation
```typescript
class MetricAggregator {
  aggregate(metrics: MetricEntry[], aggregation: AggregationType): number {
    const values = metrics.map(m => m.value);
    
    switch (aggregation) {
      case AggregationType.SUM:
        return values.reduce((a, b) => a + b, 0);
      
      case AggregationType.AVG:
        return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      
      case AggregationType.MIN:
        return Math.min(...values);
      
      case AggregationType.MAX:
        return Math.max(...values);
      
      case AggregationType.COUNT:
        return values.length;
      
      case AggregationType.P50:
      case AggregationType.P95:
      case AggregationType.P99:
        const sorted = [...values].sort((a, b) => a - b);
        const p = parseInt(aggregation.substring(1));
        return this.percentile(sorted, p);
    }
  }
  
  private percentile(sorted: number[], p: number): number {
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}
```

### Metric Flush
```typescript
class MetricFlusher {
  private config: MetricsConfig;
  
  async flush(metrics: MetricEntry[]): Promise<void> {
    if (this.config.flushTarget === FlushTarget.REMOTE) {
      await this.sendToRemote(metrics);
    } else if (this.config.flushTarget === FlushTarget.FILE) {
      await this.writeToFile(metrics);
    }
    
    // Clear metrics after flush
    this.metrics = [];
  }
  
  private async sendToRemote(metrics: MetricEntry[]): Promise<void> {
    // Send to remote monitoring system
    await this.remoteClient.send(metrics);
  }
  
  private async writeToFile(metrics: MetricEntry[]): Promise<void> {
    // Write to file
    const formatted = metrics.map(m => JSON.stringify(m)).join('\n');
    await this.fileSystem.appendFile(this.config.filePath, formatted);
  }
}
```

## Configuration

### Logging Configuration
```typescript
interface LoggingConfig {
  defaultLevel: LogLevel;
  categoryLevels: Map<LogCategory, LogLevel>;
  outputFormat: LogOutputFormat;
  outputTarget: LogOutputTarget;
  filePath?: string;
  remoteEndpoint?: string;
}

enum LogOutputFormat {
  JSON = 'json',
  TEXT = 'text',
  PRETTY = 'pretty'
}

enum LogOutputTarget {
  CONSOLE = 'console',
  FILE = 'file',
  REMOTE = 'remote',
  BOTH = 'both'
}
```

### Metrics Configuration
```typescript
interface MetricsConfig {
  flushInterval: number;
  flushTarget: FlushTarget;
  filePath?: string;
  remoteEndpoint?: string;
  labels: Map<string, string>;
}

enum FlushTarget {
  CONSOLE = 'console',
  FILE = 'file',
  REMOTE = 'remote'
}
```

## Best Practices

### Logging Guidelines
- Use appropriate log levels for severity
- Include relevant context in metadata
- Use structured logging with categories
- Avoid logging sensitive information
- Use correlation IDs for request tracing
- Configure log levels appropriately for environment

### Metrics Guidelines
- Use descriptive metric names
- Include relevant labels for categorization
- Use appropriate metric types (counter, gauge, histogram)
- Track key performance indicators
- Aggregate metrics appropriately
- Flush metrics at regular intervals

### Performance Considerations
- Use async operations for remote logging/metrics
- Implement buffering for high-volume logging
- Use efficient serialization formats
- Implement log rotation to manage file size
- Cache metric calculations
