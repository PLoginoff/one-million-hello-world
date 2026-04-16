# Attempt Management

## Overview
The Retry Layer implements attempt management with max attempts configuration, attempt counting, error propagation, and success on first success.

### Attempt Manager
```typescript
class AttemptManager {
  private maxAttempts: number;
  private attemptCount: number = 0;
  
  constructor(maxAttempts: number) {
    this.maxAttempts = maxAttempts;
  }
  
  increment(): void {
    this.attemptCount++;
  }
  
  getCount(): number {
    return this.attemptCount;
  }
  
  hasAttemptsRemaining(): boolean {
    return this.attemptCount < this.maxAttempts;
  }
  
  reset(): void {
    this.attemptCount = 0;
  }
  
  setMaxAttempts(max: number): void {
    this.maxAttempts = max;
  }
}
```

### Retry Executor
```typescript
class RetryExecutor<T> {
  private attemptManager: AttemptManager;
  private delayCalculator: DelayCalculator;
  private jitterCalculator: JitterCalculator;
  
  constructor(
    maxAttempts: number,
    delayCalculator: DelayCalculator,
    jitterCalculator: JitterCalculator
  ) {
    this.attemptManager = new AttemptManager(maxAttempts);
    this.delayCalculator = delayCalculator;
    this.jitterCalculator = jitterCalculator;
  }
  
  async execute(fn: () => Promise<T>): Promise<T> {
    let lastError: Error;
    
    while (this.attemptManager.hasAttemptsRemaining()) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        this.attemptManager.increment();
        
        if (!this.attemptManager.hasAttemptsRemaining()) {
          break;
        }
        
        const delay = this.calculateDelay();
        await this.delay(delay);
      }
    }
    
    throw lastError;
  }
  
  private calculateDelay(): number {
    const attempt = this.attemptManager.getCount() - 1;
    const delay = this.delayCalculator.calculate(attempt);
    return this.jitterCalculator.apply(delay);
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

## Best Practices

### Attempt Guidelines
- Set appropriate max attempts
- Monitor attempt patterns
- Propagate errors correctly
- Reset attempts on success
