# Jitter Implementation

## Overview
The Retry Layer implements jitter with random delay variation, configurable jitter toggle, 10% jitter by default, and prevents thundering herd.

## Jitter Definition

### Jitter Config
```typescript
interface JitterConfig {
  enabled: boolean;
  percentage: number;
}

class JitterCalculator {
  private config: JitterConfig;
  
  constructor(config: JitterConfig) {
    this.config = config;
  }
  
  apply(delay: number): number {
    if (!this.config.enabled) {
      return delay;
    }
    
    const variation = delay * (this.config.percentage / 100);
    const random = Math.random() * 2 - 1; // -1 to 1
    const jittered = delay + (variation * random);
    
    return Math.max(0, jittered);
  }
  
  enable(): void {
    this.config.enabled = true;
  }
  
  disable(): void {
    this.config.enabled = false;
  }
  
  setPercentage(percentage: number): void {
    this.config.percentage = Math.max(0, Math.min(100, percentage));
  }
}
```

## Best Practices

### Jitter Guidelines
- Enable jitter for distributed systems
- Use 10% jitter by default
- Monitor jitter effectiveness
- Prevent thundering herd
