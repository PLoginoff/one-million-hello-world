# Normalization

## Overview
The Data Transformation Layer implements normalization with string trimming and lowercasing, object property normalization, configurable normalization toggle, and non-destructive transformation.

## String Normalization

### String Normalizer
```typescript
class StringNormalizer {
  trim(value: string): string {
    return value.trim();
  }
  
  toLowerCase(value: string): string {
    return value.toLowerCase();
  }
  
  toUpperCase(value: string): string {
    return value.toUpperCase();
  }
  
  normalize(value: string): string {
    return this.trim(this.toLowerCase(value));
  }
  
  removeWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }
}
```

### Object Property Normalization
```typescript
class PropertyNormalizer {
  normalizeKeys(obj: any): any {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }
    
    const normalized: any = Array.isArray(obj) ? [] : {};
    
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const normalizedKey = this.normalizeKey(key);
        normalized[normalizedKey] = this.normalizeKeys(obj[key]);
      }
    }
    
    return normalized;
  }
  
  normalizeKey(key: string): string {
    return key
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '');
  }
  
  camelToSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }
  
  snakeToCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }
}
```

## Normalization Configuration

### Normalization Config
```typescript
interface NormalizationConfig {
  enabled: boolean;
  trimStrings: boolean;
  lowercaseStrings: boolean;
  normalizeKeys: boolean;
  removeExtraWhitespace: boolean;
}

class NormalizationConfigManager {
  private config: NormalizationConfig;
  
  constructor(defaultConfig: NormalizationConfig) {
    this.config = defaultConfig;
  }
  
  enable(): void {
    this.config.enabled = true;
  }
  
  disable(): void {
    this.config.enabled = false;
  }
  
  setTrimStrings(enabled: boolean): void {
    this.config.trimStrings = enabled;
  }
  
  setLowercaseStrings(enabled: boolean): void {
    this.config.lowercaseStrings = enabled;
  }
  
  setNormalizeKeys(enabled: boolean): void {
    this.config.normalizeKeys = enabled;
  }
  
  setRemoveExtraWhitespace(enabled: boolean): void {
    this.config.removeExtraWhitespace = enabled;
  }
  
  getConfig(): NormalizationConfig {
    return { ...this.config };
  }
}
```

## Normalization Engine

### Normalization Engine
```typescript
class NormalizationEngine {
  private config: NormalizationConfig;
  private stringNormalizer: StringNormalizer;
  private propertyNormalizer: PropertyNormalizer;
  
  constructor(config: NormalizationConfig) {
    this.config = config;
    this.stringNormalizer = new StringNormalizer();
    this.propertyNormalizer = new PropertyNormalizer();
  }
  
  normalize(data: any): any {
    if (!this.config.enabled) {
      return data;
    }
    
    let result = data;
    
    if (this.config.normalizeKeys) {
      result = this.propertyNormalizer.normalizeKeys(result);
    }
    
    result = this.normalizeStrings(result);
    
    return result;
  }
  
  private normalizeStrings(data: any): any {
    if (typeof data === 'string') {
      return this.normalizeString(data);
    }
    
    if (typeof data === 'object' && data !== null) {
      const normalized: any = Array.isArray(data) ? [] : {};
      
      for (const key in data) {
        if (data.hasOwnProperty(key)) {
          normalized[key] = this.normalizeStrings(data[key]);
        }
      }
      
      return normalized;
    }
    
    return data;
  }
  
  private normalizeString(value: string): string {
    let result = value;
    
    if (this.config.trimStrings) {
      result = this.stringNormalizer.trim(result);
    }
    
    if (this.config.lowercaseStrings) {
      result = this.stringNormalizer.toLowerCase(result);
    }
    
    if (this.config.removeExtraWhitespace) {
      result = this.stringNormalizer.removeWhitespace(result);
    }
    
    return result;
  }
}
```

## Best Practices

### Normalization Guidelines
- Use non-destructive transformations
- Configure normalization based on data source
- Test normalization with various data types
- Preserve original data structure
- Document normalization rules

### Performance Considerations
- Use efficient string operations
- Avoid deep cloning when possible
- Cache normalization results
- Monitor normalization performance
