# Failure Handling

## Overview
The Circuit Breaker Layer implements failure handling with failure threshold tracking, automatic circuit opening, reset timeout management, and failure count reset on success.

## Failure Handler

### Failure Handler
```typescript
class FailureHandler {
  private failureCount: number = 0;
  private failureThreshold: number;
  private resetTimeout: number;
  private lastFailureTime: Date | null = null;
  
  constructor(threshold: number, resetTimeout: number) {
    this.failureThreshold = threshold;
    this.resetTimeout = resetTimeout;
  }
  
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();
  }
  
  recordSuccess(): void {
    this.failureCount = 0;
    this.lastFailureTime = null;
  }
  
  shouldOpenCircuit(): boolean {
    return this.failureCount >= this.failureThreshold;
  }
  
  shouldReset(): boolean {
    if (!this.lastFailureTime) return false;
    
    const elapsed = Date.now() - this.lastFailureTime.getTime();
    return elapsed >= this.resetTimeout;
  }
  
  getFailureCount(): number {
    return this.failureCount;
  }
  
  reset(): void {
    this.failureCount = 0;
    this.lastFailureTime = null;
  }
}
```

## Timeout Management

### Timeout Manager
```typescript
class TimeoutManager {
  private resetTimeout: number;
  private lastFailureTime: Date | null = null;
  
  constructor(resetTimeout: number) {
    this.resetTimeout = resetTimeout;
  }
  
  recordFailure(): void {
    this.lastFailureTime = new Date();
  }
  
  recordSuccess(): void {
    this.lastFailureTime = null;
  }
  
  getRemainingTime(): number {
    if (!this.lastFailureTime) return 0;
    
    const elapsed = Date.now() - this.lastFailureTime.getTime();
    const remaining = this.resetTimeout - elapsed;
    
    return Math.max(0, remaining);
  }
  
  isTimeoutExpired(): boolean {
    return this.getRemainingTime() === 0;
  }
}
```

## Best Practices

### Failure Handling Guidelines
- Set appropriate failure thresholds
- Configure reasonable reset timeouts
- Monitor failure patterns
- Reset on successful recovery
- Document failure criteria

### Performance Considerations
- Monitor failure check overhead
- Use efficient counting
