# Feature Flags

## Overview
The Strategy Layer implements feature flags with flag registration, enable/disable flags, percentage-based rollout, and flag status checking.

## Flag Definition

### Feature Flag
```typescript
interface FeatureFlag {
  name: string;
  enabled: boolean;
  percentage: number;
}

class FeatureFlagManager {
  private flags: Map<string, FeatureFlag> = new Map();
  
  register(name: string, percentage: number = 100): void {
    this.flags.set(name, {
      name,
      enabled: false,
      percentage
    });
  }
  
  enable(name: string): void {
    const flag = this.flags.get(name);
    if (flag) {
      flag.enabled = true;
    }
  }
  
  disable(name: string): void {
    const flag = this.flags.get(name);
    if (flag) {
      flag.enabled = false;
    }
  }
  
  isEnabled(name: string): boolean {
    const flag = this.flags.get(name);
    if (!flag || !flag.enabled) {
      return false;
    }
    
    if (flag.percentage >= 100) {
      return true;
    }
    
    return Math.random() * 100 < flag.percentage;
  }
  
  setPercentage(name: string, percentage: number): void {
    const flag = this.flags.get(name);
    if (flag) {
      flag.percentage = Math.max(0, Math.min(100, percentage));
    }
  }
}
```

## Best Practices

### Flag Guidelines
- Use descriptive flag names
- Document flag purpose
- Use percentage for gradual rollout
- Monitor flag usage
