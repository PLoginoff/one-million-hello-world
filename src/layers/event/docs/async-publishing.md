# Async Publishing

## Overview
The Event Layer supports both synchronous and asynchronous publishing with configurable async behavior and promise-based async operations.

## Async Publishing Implementation

### Async Event Bus
```typescript
class AsyncEventBus extends EventBus {
  private config: AsyncEventBusConfig;
  
  constructor(config: AsyncEventBusConfig) {
    super(config);
    this.config = config;
  }
  
  async publishAsync(event: Event): Promise<void> {
    const subscriptions = this.subscriptions.get(event.type) || [];
    
    if (this.config.queueSizeLimit > 0) {
      await this.publishWithQueueLimit(event, subscriptions);
    } else {
      await this.publishAllAsync(event, subscriptions);
    }
  }
  
  private async publishAllAsync(event: Event, subscriptions: Subscription[]): Promise<void> {
    const promises = subscriptions.map(subscription => this.executeHandler(subscription, event));
    
    if (this.config.parallel) {
      await Promise.all(promises);
    } else {
      for (const promise of promises) {
        await promise;
      }
    }
  }
  
  private async publishWithQueueLimit(event: Event, subscriptions: Subscription[]): Promise<void> {
    const queue = subscriptions.slice(0, this.config.queueSizeLimit);
    const promises = queue.map(subscription => this.executeHandler(subscription, event));
    
    await Promise.all(promises);
    
    if (subscriptions.length > this.config.queueSizeLimit) {
      const remaining = subscriptions.slice(this.config.queueSizeLimit);
      await this.publishWithQueueLimit(event, remaining);
    }
  }
}
```

### Async Configuration
```typescript
interface AsyncEventBusConfig extends EventBusConfig {
  parallel: boolean;
  queueSizeLimit: number;
  timeout: number;
}

class AsyncConfigManager {
  private config: AsyncEventBusConfig;
  
  constructor(defaultConfig: AsyncEventBusConfig) {
    this.config = defaultConfig;
  }
  
  enableParallel(): void {
    this.config.parallel = true;
  }
  
  disableParallel(): void {
    this.config.parallel = false;
  }
  
  setQueueSizeLimit(limit: number): void {
    this.config.queueSizeLimit = limit;
  }
  
  setTimeout(timeout: number): void {
    this.config.timeout = timeout;
  }
  
  getConfig(): AsyncEventBusConfig {
    return { ...this.config };
  }
}
```

## Promise-Based Operations

### Promise Handler Execution
```typescript
class PromiseHandlerExecutor {
  async executeWithTimeout(
    handler: EventHandler,
    event: Event,
    timeout: number
  ): Promise<void> {
    const promise = handler(event);
    
    if (timeout > 0) {
      return await this.withTimeout(promise, timeout);
    }
    
    return await promise;
  }
  
  private async withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error('Handler timeout')), timeout)
      )
    ]);
  }
}
```

### Retry Logic
```typescript
class AsyncRetryHandler {
  async executeWithRetry(
    handler: EventHandler,
    event: Event,
    maxRetries: number,
    backoffMs: number
  ): Promise<void> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await handler(event);
        return;
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < maxRetries) {
          await this.delay(backoffMs * Math.pow(2, attempt));
        }
      }
    }
    
    throw lastError;
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

## Best Practices

### Async Publishing Guidelines
- Use async for I/O-bound handlers
- Implement timeout for handlers
- Use parallel execution when safe
- Implement retry for transient failures
- Monitor async performance

### Queue Management Guidelines
- Set appropriate queue size limits
- Monitor queue backlog
- Implement backpressure handling
- Use batching for high-volume events
- Monitor queue processing time

### Error Handling Guidelines
- Catch handler errors in async context
- Implement timeout for handlers
- Use retry for transient failures
- Log async errors with context
