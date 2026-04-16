# Statistics Tracking

## Overview
The Circuit Breaker Layer implements statistics tracking with success count tracking, failure count tracking, last failure time tracking, and current state tracking.

## Statistics Structure

### Circuit Statistics
```typescript
interface CircuitStatistics {
  state: CircuitState;
  successCount: number;
  failureCount: number;
  lastFailureTime: Date | null;
  lastSuccessTime: Date | null;
  totalRequests: number;
}
```

### Statistics Tracker
```typescript
class CircuitStatisticsTracker {
  private stats: CircuitStatistics;
  
  constructor() {
    this.stats = {
      state: CircuitState.CLOSED,
      successCount: 0,
      failureCount: 0,
      lastFailureTime: null,
      lastSuccessTime: null,
      totalRequests: 0
    };
  }
  
  recordSuccess(): void {
    this.stats.successCount++;
    this.stats.lastSuccessTime = new Date();
    this.stats.totalRequests++;
  }
  
  recordFailure(): void {
    this.stats.failureCount++;
    this.stats.lastFailureTime = new Date();
    this.stats.totalRequests++;
  }
  
  setState(state: CircuitState): void {
    this.stats.state = state;
  }
  
  getStatistics(): CircuitStatistics {
    return {
      state: this.stats.state,
      successCount: this.stats.successCount,
      failureCount: this.stats.failureCount,
      lastFailureTime: this.stats.lastFailureTime,
      lastSuccessTime: this.stats.lastSuccessTime,
      totalRequests: this.stats.totalRequests
    };
  }
  
  getSuccessRate(): number {
    if (this.stats.totalRequests === 0) return 0;
    return this.stats.successCount / this.stats.totalRequests;
  }
  
  getFailureRate(): number {
    if (this.stats.totalRequests === 0) return 0;
    return this.stats.failureCount / this.stats.totalRequests;
  }
  
  reset(): void {
    this.stats = {
      state: CircuitState.CLOSED,
      successCount: 0,
      failureCount: 0,
      lastFailureTime: null,
      lastSuccessTime: null,
      totalRequests: 0
    };
  }
}
```

## Best Practices

### Statistics Guidelines
- Track all circuit operations
- Monitor success/failure rates
- Track state transitions
- Monitor circuit health
- Reset statistics appropriately
