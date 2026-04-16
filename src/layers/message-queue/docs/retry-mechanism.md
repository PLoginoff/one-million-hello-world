# Retry Mechanism

## Overview
The Message Queue Layer implements a retry mechanism with configurable max retries, retry delay configuration, automatic retry on failure, and attempt tracking per message.

## Retry Configuration

### Retry Config
```typescript
interface RetryConfig {
  maxRetries: number;
  retryDelay: number;
  exponentialBackoff: boolean;
  backoffMultiplier: number;
}

class RetryConfigManager {
  private config: RetryConfig;
  
  constructor(defaultConfig: RetryConfig) {
    this.config = defaultConfig;
  }
  
  setMaxRetries(maxRetries: number): void {
    this.config.maxRetries = maxRetries;
  }
  
  setRetryDelay(delay: number): void {
    this.config.retryDelay = delay;
  }
  
  enableExponentialBackoff(multiplier: number = 2): void {
    this.config.exponentialBackoff = true;
    this.config.backoffMultiplier = multiplier;
  }
  
  disableExponentialBackoff(): void {
    this.config.exponentialBackoff = false;
  }
  
  getConfig(): RetryConfig {
    return { ...this.config };
  }
}
```

## Retry Strategy

### Retry Handler
```typescript
class RetryHandler {
  private config: RetryConfig;
  private queueManager: QueueManager;
  
  constructor(config: RetryConfig, queueManager: QueueManager) {
    this.config = config;
    this.queueManager = queueManager;
  }
  
  async handleWithRetry(message: Message, handler: MessageHandler): Promise<void> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        await handler.handle(message);
        return;
      } catch (error) {
        lastError = error as Error;
        message.attempts = attempt + 1;
        
        if (attempt < this.config.maxRetries) {
          const delay = this.calculateDelay(attempt);
          await this.delay(delay);
        }
      }
    }
    
    throw lastError;
  }
  
  private calculateDelay(attempt: number): number {
    if (this.config.exponentialBackoff) {
      return this.config.retryDelay * Math.pow(this.config.backoffMultiplier, attempt);
    }
    
    return this.config.retryDelay;
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

## Attempt Tracking

### Attempt Tracker
```typescript
class AttemptTracker {
  private attempts: Map<string, number[]> = new Map();
  
  recordAttempt(messageId: string, attemptNumber: number): void {
    if (!this.attempts.has(messageId)) {
      this.attempts.set(messageId, []);
    }
    
    this.attempts.get(messageId)?.push(attemptNumber);
  }
  
  getAttempts(messageId: string): number[] {
    return this.attempts.get(messageId) || [];
  }
  
  getAttemptCount(messageId: string): number {
    return this.getAttempts(messageId).length;
  }
  
  shouldRetry(messageId: string, maxRetries: number): boolean {
    return this.getAttemptCount(messageId) < maxRetries;
  }
  
  clearAttempts(messageId: string): void {
    this.attempts.delete(messageId);
  }
  
  clearAll(): void {
    this.attempts.clear();
  }
}
```

## Retry Statistics

### Retry Statistics
```typescript
interface RetryStatistics {
  totalRetries: number;
  retriesByAttempt: Map<number, number>;
  successfulAfterRetry: number;
  failedAfterMaxRetries: number;
}

class RetryStatisticsTracker {
  private stats: RetryStatistics;
  
  constructor() {
    this.stats = {
      totalRetries: 0,
      retriesByAttempt: new Map(),
      successfulAfterRetry: 0,
      failedAfterMaxRetries: 0
    };
  }
  
  recordRetry(attemptNumber: number): void {
    this.stats.totalRetries++;
    
    const count = this.stats.retriesByAttempt.get(attemptNumber) || 0;
    this.stats.retriesByAttempt.set(attemptNumber, count + 1);
  }
  
  recordSuccessAfterRetry(): void {
    this.stats.successfulAfterRetry++;
  }
  
  recordFailureAfterMaxRetries(): void {
    this.stats.failedAfterMaxRetries++;
  }
  
  getStatistics(): RetryStatistics {
    return {
      totalRetries: this.stats.totalRetries,
      retriesByAttempt: new Map(this.stats.retriesByAttempt),
      successfulAfterRetry: this.stats.successfulAfterRetry,
      failedAfterMaxRetries: this.stats.failedAfterMaxRetries
    };
  }
  
  reset(): void {
    this.stats = {
      totalRetries: 0,
      retriesByAttempt: new Map(),
      successfulAfterRetry: 0,
      failedAfterMaxRetries: 0
    };
  }
}
```

## Best Practices

### Retry Configuration Guidelines
- Set appropriate max retries based on operation
- Use exponential backoff for transient failures
- Set reasonable retry delays
- Monitor retry statistics
- Adjust retry strategy based on failure patterns

### Attempt Tracking Guidelines
- Track all retry attempts
- Monitor attempt distribution
- Alert on excessive retries
- Clear attempts after successful processing
- Track retry success rates

### Performance Considerations
- Use exponential backoff to avoid overwhelming services
- Set appropriate retry limits
- Monitor retry overhead
- Circuit break on persistent failures
