# Monitoring Layer Documentation

## Overview
The Monitoring Layer provides observability and logging capabilities for the Event Layer. This layer collects metrics, logs events, and provides insights into event processing performance and health.

## Components

### Interfaces

#### IEventMetrics
- **Purpose**: Interface for event metrics collection
- **Location**: `monitoring/IEventMetrics.ts`
- **Methods**:
  - `recordEventPublished(eventType)`: Record event publication
  - `recordEventHandled(eventType, processingTime)`: Record event handling
  - `recordError(eventType, error)`: Record error occurrence
  - `recordQueueSize(size)`: Record queue size
  - `recordSubscriptionCount(count)`: Record subscription count
  - `getMetrics()`: Get all metrics
  - `getTimeSeries(metricName, duration)`: Get time-series data
  - `reset()`: Reset all metrics

### Implementations

#### EventMetricsCollector
- **Purpose**: Collect and aggregate event metrics
- **Location**: `monitoring/EventMetricsCollector.ts`
- **Metrics Collected**:
  - `totalEventsPublished`: Total events published
  - `totalEventsHandled`: Total events handled
  - `totalErrors`: Total errors encountered
  - `eventsByType`: Events count by type
  - `errorsByType`: Errors count by type
  - `avgProcessingTime`: Average processing time
  - `p95ProcessingTime`: 95th percentile processing time
  - `p99ProcessingTime`: 99th percentile processing time
  - `currentQueueSize`: Current queue size
  - `activeSubscriptions`: Active subscription count

**Features**:
  - Time-series data collection
  - Configurable max time-series points
  - Percentile calculations
  - Event type tracking
  - Error type tracking
  - Statistics aggregation

**Usage Example**:
```typescript
import { EventMetricsCollector } from './monitoring';
import { Event } from './domain';

const collector = new EventMetricsCollector();

// Record metrics
collector.recordEventPublished('test.event');
collector.recordEventHandled('test.event', 100);
collector.recordError('test.event', new Error('Handler error'));
collector.recordQueueSize(50);
collector.recordSubscriptionCount(10);

// Get metrics
const metrics = collector.getMetrics();
console.log('Total published:', metrics.totalEventsPublished);
console.log('Avg processing time:', metrics.avgProcessingTime);
console.log('P95 processing time:', metrics.p95ProcessingTime);

// Get time-series data
const timeSeries = collector.getTimeSeries('events_published', 60000); // Last 60 seconds
console.log(timeSeries);

// Reset metrics
collector.reset();
```

#### EventLogger

- **Purpose**: Log event activities
- **Location**: `monitoring/EventLogger.ts`
- **Log Levels**:
  - `DEBUG`: Detailed debugging information
  - `INFO`: General informational messages
  - `WARN`: Warning messages
  - `ERROR`: Error messages

**Features**:
  - Configurable log level
  - Console output (can be disabled)
  - Log entry management
  - Log filtering by level
  - Recent entries retrieval
  - Configurable max entries
  - Timestamp tracking

**Usage Example**:
```typescript
import { EventLogger, LogLevel } from './monitoring';

const logger = new EventLogger({
  level: LogLevel.DEBUG,
  enableConsole: true,
  maxEntries: 1000,
});

// Log messages
logger.debug('Debug message', { key: 'value' });
logger.info('Info message');
logger.warn('Warning message');
logger.error('Error message', { error: 'details' });

// Get entries
const allEntries = logger.getEntries();
const debugEntries = logger.getEntries(LogLevel.DEBUG);
const recentEntries = logger.getRecentEntries(10);

// Clear logs
logger.clear();
```

## Design Principles

### Observability
The layer provides comprehensive visibility into event processing:
- Metrics for performance monitoring
- Logs for debugging and auditing
- Time-series data for trend analysis

### Configurability
Both metrics collector and logger are highly configurable:
- Log level filtering
- Console output control
- Entry limits
- Time-series limits

### Performance
Metrics collection is designed to be low-overhead:
- Efficient data structures
- Configurable limits
- Optional time-series collection

### Separation of Concerns
- EventMetricsCollector: Metrics and statistics
- EventLogger: Logging and debugging

## Integration with Other Layers

- **Domain Layer**: Logs and metrics for domain events
- **Core Layer**: Integration with EventBus for automatic metrics
- **Application Layer**: Integration with EventDispatcher
- **Infrastructure Layer**: Integration with event stores and queues
- **Configuration Layer**: Configuration via EventBusConfig

## Usage in Event Processing

```typescript
import { EventMetricsCollector, EventLogger } from './monitoring';
import { EventDispatcher } from './application';

const metrics = new EventMetricsCollector();
const logger = new EventLogger();
const dispatcher = new EventDispatcher(registry, eventBus);

// Track event publication
metrics.recordEventPublished(event.type.value);

// Dispatch event
const result = await dispatcher.dispatch(event);

// Track event handling
if (result.success) {
  metrics.recordEventHandled(event.type.value, result.executionTime);
  logger.info('Event handled successfully', { eventType: event.type.value });
} else {
  metrics.recordError(event.type.value, result.errors[0]);
  logger.error('Event handling failed', { errors: result.errors });
}
```

## Testing
Monitoring Layer tests are located in `__tests__/monitoring/`:
- `EventMetricsCollector.test.ts`
- `EventLogger.test.ts`

All tests cover metrics recording, time-series data, log levels, and edge cases.
