# Retry Strategies

## Overview
The Retry Layer implements multiple retry strategies including exponential backoff (default), fixed delay, linear backoff, and configurable strategy selection.

## Strategy Definition

### Retry Strategy
```typescript
enum RetryStrategy {
  EXPONENTIAL_BACKOFF = 'exponential_backoff',
  FIXED_DELAY = 'fixed_delay',
  LINEAR_BACKOFF = 'linear_backoff'
}

interface StrategyConfig {
  strategy: RetryStrategy;
  baseDelay: number;
  maxDelay: number;
  multiplier: number;
}
```

### Exponential Backoff Strategy
```typescript
class ExponentialBackoffStrategy {
  calculateDelay(attempt: number, config: StrategyConfig): number {
    const delay = config.baseDelay * Math.pow(config.multiplier, attempt);
    return Math.min(delay, config.maxDelay);
  }
}
```

### Fixed Delay Strategy
```typescript
class FixedDelayStrategy {
  calculateDelay(attempt: number, config: StrategyConfig): number {
    return config.baseDelay;
  }
}
```

### Linear Backoff Strategy
```typescript
class LinearBackoffStrategy {
  calculateDelay(attempt: number, config: StrategyConfig): number {
    const delay = config.baseDelay + (attempt * config.multiplier);
    return Math.min(delay, config.maxDelay);
  }
}
```

### Strategy Selector
```typescript
class StrategySelector {
  private strategies: Map<RetryStrategy, any>;
  
  constructor() {
    this.strategies = new Map([
      [RetryStrategy.EXPONENTIAL_BACKOFF, new ExponentialBackoffStrategy()],
      [RetryStrategy.FIXED_DELAY, new FixedDelayStrategy()],
      [RetryStrategy.LINEAR_BACKOFF, new LinearBackoffStrategy()]
    ]);
  }
  
  calculateDelay(attempt: number, config: StrategyConfig): number {
    const strategy = this.strategies.get(config.strategy);
    if (!strategy) {
      throw new Error(`Unknown strategy: ${config.strategy}`);
    }
    
    return strategy.calculateDelay(attempt, config);
  }
}
```

## Best Practices

### Strategy Guidelines
- Use exponential backoff for transient failures
- Use fixed delay for predictable retry patterns
- Use linear backoff for gradual increase
- Set appropriate max delay
- Monitor retry patterns

### Performance Considerations
- Monitor delay calculation overhead
- Use efficient math operations
