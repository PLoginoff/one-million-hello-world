# Delay Calculation

## Overview
The Retry Layer implements delay calculation with base delay configuration, max delay cap, strategy-specific calculation, and jitter support for randomness.

## Delay Calculator

### Delay Calculator
```typescript
class DelayCalculator {
  private config: StrategyConfig;
  private strategySelector: StrategySelector;
  
  constructor(config: StrategyConfig) {
    this.config = config;
    this.strategySelector = new StrategySelector();
  }
  
  calculate(attempt: number): number {
    const delay = this.strategySelector.calculateDelay(attempt, this.config);
    return delay;
  }
  
  setConfig(config: StrategyConfig): void {
    this.config = config;
  }
  
  getConfig(): StrategyConfig {
    return { ...this.config };
  }
}
```

## Best Practices

### Delay Guidelines
- Set appropriate base delay
- Configure max delay cap
- Use appropriate strategy
- Monitor delay patterns

### Performance Considerations
- Monitor delay calculation overhead
- Use efficient math operations
