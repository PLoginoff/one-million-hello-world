# Enrichment

## Overview
The Data Transformation Layer implements enrichment with data enrichment from external sources, field merging, configurable enrichment toggle, and source tracking.

## Enrichment Structure

### Enrichment Definition
```typescript
interface EnrichmentSource {
  name: string;
  fetchData: (key: string) => Promise<any>;
  cache: boolean;
  ttl?: number;
}

interface EnrichmentResult {
  data: any;
  enrichedFields: string[];
  sources: string[];
}
```

### Enrichment Engine
```typescript
class EnrichmentEngine {
  private sources: Map<string, EnrichmentSource> = new Map();
  private cache: Map<string, { data: any; expiresAt: Date }> = new Map();
  private enabled: boolean;
  
  constructor(enabled: boolean = true) {
    this.enabled = enabled;
  }
  
  registerSource(source: EnrichmentSource): void {
    this.sources.set(source.name, source);
  }
  
  unregisterSource(name: string): void {
    this.sources.delete(name);
  }
  
  async enrich(data: any, enrichmentRules: EnrichmentRule[]): Promise<EnrichmentResult> {
    if (!this.enabled) {
      return {
        data,
        enrichedFields: [],
        sources: []
      };
    }
    
    const enrichedFields: string[] = [];
    const sources: string[] = [];
    let result = data;
    
    for (const rule of enrichmentRules) {
      const source = this.sources.get(rule.sourceName);
      
      if (!source) {
        continue;
      }
      
      const enrichedData = await this.fetchFromSource(source, rule.key);
      
      if (enrichedData) {
        result = this.mergeFields(result, enrichedData, rule.targetField);
        enrichedFields.push(rule.targetField);
        sources.push(rule.sourceName);
      }
    }
    
    return {
      data: result,
      enrichedFields,
      sources
    };
  }
  
  private async fetchFromSource(source: EnrichmentSource, key: string): Promise<any> {
    const cacheKey = `${source.name}:${key}`;
    
    if (source.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > new Date()) {
        return cached.data;
      }
    }
    
    const data = await source.fetchData(key);
    
    if (source.cache) {
      const ttl = source.ttl || 300; // Default 5 minutes
      this.cache.set(cacheKey, {
        data,
        expiresAt: new Date(Date.now() + ttl * 1000)
      });
    }
    
    return data;
  }
  
  private mergeFields(target: any, source: any, targetField: string): any {
    if (typeof target !== 'object' || target === null) {
      return target;
    }
    
    return {
      ...target,
      [targetField]: source
    };
  }
  
  enable(): void {
    this.enabled = true;
  }
  
  disable(): void {
    this.enabled = false;
  }
  
  clearCache(): void {
    this.cache.clear();
  }
}
```

## Enrichment Rules

### Enrichment Rule
```typescript
interface EnrichmentRule {
  sourceName: string;
  key: string;
  targetField: string;
  transform?: (data: any) => any;
}

class EnrichmentRuleBuilder {
  private rule: Partial<EnrichmentRule> = {};
  
  setSource(name: string): this {
    this.rule.sourceName = name;
    return this;
  }
  
  setKey(key: string): this {
    this.rule.key = key;
    return this;
  }
  
  setTargetField(field: string): this {
    this.rule.targetField = field;
    return this;
  }
  
  setTransform(transform: (data: any) => any): this {
    this.rule.transform = transform;
    return this;
  }
  
  build(): EnrichmentRule {
    if (!this.rule.sourceName || !this.rule.key || !this.rule.targetField) {
      throw new Error('Invalid enrichment rule');
    }
    
    return this.rule as EnrichmentRule;
  }
}
```

## Field Merging

### Field Merger
```typescript
class FieldMerger {
  merge(target: any, source: any, options: MergeOptions = {}): any {
    const {
      overwrite = true,
      mergeArrays = false,
      deep = false
    } = options;
    
    if (typeof target !== 'object' || target === null) {
      return source;
    }
    
    if (typeof source !== 'object' || source === null) {
      return target;
    }
    
    const result = { ...target };
    
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (overwrite || !result.hasOwnProperty(key)) {
          if (deep && typeof source[key] === 'object' && typeof result[key] === 'object') {
            result[key] = this.merge(result[key], source[key], options);
          } else if (mergeArrays && Array.isArray(result[key]) && Array.isArray(source[key])) {
            result[key] = [...result[key], ...source[key]];
          } else {
            result[key] = source[key];
          }
        }
      }
    }
    
    return result;
  }
}

interface MergeOptions {
  overwrite?: boolean;
  mergeArrays?: boolean;
  deep?: boolean;
}
```

## Best Practices

### Enrichment Guidelines
- Use caching for external data
- Configure enrichment based on data needs
- Track enrichment sources
- Handle enrichment failures gracefully
- Document enrichment rules

### Performance Considerations
- Cache enrichment results
- Use efficient data fetching
- Monitor enrichment performance
- Implement rate limiting for external sources
