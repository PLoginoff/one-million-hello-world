# Threshold Management

## Overview
The Compression Layer implements threshold management with minimum size for compression, threshold configuration, skip compression for small data, and ratio calculation.

## Threshold Configuration

### Threshold Config
```typescript
interface ThresholdConfig {
  minSize: number;
  skipSmallData: boolean;
  minRatio: number;
}

class ThresholdManager {
  private config: ThresholdConfig;
  
  constructor(config: ThresholdConfig) {
    this.config = config;
  }
  
  shouldCompress(data: Buffer): boolean {
    if (this.config.skipSmallData && data.length < this.config.minSize) {
      return false;
    }
    
    return true;
  }
  
  checkRatio(originalSize: number, compressedSize: number): boolean {
    const ratio = originalSize / compressedSize;
    return ratio >= this.config.minRatio;
  }
  
  setMinSize(size: number): void {
    this.config.minSize = size;
  }
  
  setSkipSmallData(skip: boolean): void {
    this.config.skipSmallData = skip;
  }
  
  setMinRatio(ratio: number): void {
    this.config.minRatio = ratio;
  }
  
  getConfig(): ThresholdConfig {
    return { ...this.config };
  }
}
```

## Ratio Calculator

### Ratio Calculator
```typescript
class RatioCalculator {
  calculate(originalSize: number, compressedSize: number): number {
    if (compressedSize === 0) return 0;
    return originalSize / compressedSize;
  }
  
  calculatePercentage(originalSize: number, compressedSize: number): number {
    if (originalSize === 0) return 0;
    const saved = originalSize - compressedSize;
    return (saved / originalSize) * 100;
  }
  
  isCompressed(originalSize: number, compressedSize: number): boolean {
    return compressedSize < originalSize;
  }
}
```

## Best Practices

### Threshold Guidelines
- Set appropriate minimum size
- Monitor compression ratios
- Skip compression for small data
- Adjust thresholds based on workload

### Performance Considerations
- Monitor threshold check overhead
- Use efficient size comparisons
