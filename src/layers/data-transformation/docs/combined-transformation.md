# Combined Transformation

## Overview
The Data Transformation Layer implements combined transformation with sequential transformation pipeline (Normalization → Enrichment → Mapping), error propagation, and configurable pipeline steps.

## Pipeline Configuration

### Pipeline Config
```typescript
interface PipelineConfig {
  normalizationEnabled: boolean;
  enrichmentEnabled: boolean;
  mappingEnabled: boolean;
  steps: TransformationStep[];
}

enum TransformationStep {
  NORMALIZATION = 'normalization',
  ENRICHMENT = 'mapping',
  MAPPING = 'mapping'
}
```

### Transformation Pipeline
```typescript
class TransformationPipeline {
  private config: PipelineConfig;
  private normalizationEngine: NormalizationEngine;
  private enrichmentEngine: EnrichmentEngine;
  private fieldMapper: FieldMapper;
  
  constructor(
    config: PipelineConfig,
    normalizationEngine: NormalizationEngine,
    enrichmentEngine: EnrichmentEngine,
    fieldMapper: FieldMapper
  ) {
    this.config = config;
    this.normalizationEngine = normalizationEngine;
    this.enrichmentEngine = enrichmentEngine;
    this.fieldMapper = fieldMapper;
  }
  
  async transform(data: any, enrichmentRules?: EnrichmentRule[]): Promise<any> {
    let result = data;
    
    for (const step of this.config.steps) {
      try {
        result = await this.executeStep(result, step, enrichmentRules);
      } catch (error) {
        throw new TransformationError(`Error in step ${step}: ${error.message}`);
      }
    }
    
    return result;
  }
  
  private async executeStep(data: any, step: TransformationStep, enrichmentRules?: EnrichmentRule[]): Promise<any> {
    switch (step) {
      case TransformationStep.NORMALIZATION:
        if (this.config.normalizationEnabled) {
          return this.normalizationEngine.normalize(data);
        }
        return data;
        
      case TransformationStep.ENRICHMENT:
        if (this.config.enrichmentEnabled && enrichmentRules) {
          const result = await this.enrichmentEngine.enrich(data, enrichmentRules);
          return result.data;
        }
        return data;
        
      case TransformationStep.MAPPING:
        if (this.config.mappingEnabled) {
          return this.fieldMapper.map(data);
        }
        return data;
        
      default:
        return data;
    }
  }
  
  enableStep(step: TransformationStep): void {
    switch (step) {
      case TransformationStep.NORMALIZATION:
        this.config.normalizationEnabled = true;
        break;
      case TransformationStep.ENRICHMENT:
        this.config.enrichmentEnabled = true;
        break;
      case TransformationStep.MAPPING:
        this.config.mappingEnabled = true;
        break;
    }
  }
  
  disableStep(step: TransformationStep): void {
    switch (step) {
      case TransformationStep.NORMALIZATION:
        this.config.normalizationEnabled = false;
        break;
      case TransformationStep.ENRICHMENT:
        this.config.enrichmentEnabled = false;
        break;
      case TransformationStep.MAPPING:
        this.config.mappingEnabled = false;
        break;
    }
  }
  
  setSteps(steps: TransformationStep[]): void {
    this.config.steps = steps;
  }
}
```

## Pipeline Builder

### Pipeline Builder
```typescript
class PipelineBuilder {
  private config: PipelineConfig;
  private normalizationEngine?: NormalizationEngine;
  private enrichmentEngine?: EnrichmentEngine;
  private fieldMapper?: FieldMapper;
  
  constructor() {
    this.config = {
      normalizationEnabled: true,
      enrichmentEnabled: true,
      mappingEnabled: true,
      steps: [
        TransformationStep.NORMALIZATION,
        TransformationStep.ENRICHMENT,
        TransformationStep.MAPPING
      ]
    };
  }
  
  withNormalization(engine: NormalizationEngine): this {
    this.normalizationEngine = engine;
    return this;
  }
  
  withEnrichment(engine: EnrichmentEngine): this {
    this.enrichmentEngine = engine;
    return this;
  }
  
  withMapping(mapper: FieldMapper): this {
    this.fieldMapper = mapper;
    return this;
  }
  
  withSteps(steps: TransformationStep[]): this {
    this.config.steps = steps;
    return this;
  }
  
  enableNormalization(): this {
    this.config.normalizationEnabled = true;
    return this;
  }
  
  disableNormalization(): this {
    this.config.normalizationEnabled = false;
    return this;
  }
  
  enableEnrichment(): this {
    this.config.enrichmentEnabled = true;
    return this;
  }
  
  disableEnrichment(): this {
    this.config.enrichmentEnabled = false;
    return this;
  }
  
  enableMapping(): this {
    this.config.mappingEnabled = true;
    return this;
  }
  
  disableMapping(): this {
    this.config.mappingEnabled = false;
    return this;
  }
  
  build(): TransformationPipeline {
    if (!this.normalizationEngine || !this.enrichmentEngine || !this.fieldMapper) {
      throw new Error('Missing required engines');
    }
    
    return new TransformationPipeline(
      this.config,
      this.normalizationEngine,
      this.enrichmentEngine,
      this.fieldMapper
    );
  }
}
```

## Error Handling

### Error Types
```typescript
class TransformationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransformationError';
  }
}

class MappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MappingError';
  }
}
```

## Best Practices

### Pipeline Guidelines
- Use sequential pipeline steps
- Configure steps based on data needs
- Handle errors gracefully
- Monitor pipeline performance
- Document pipeline configuration

### Performance Considerations
- Optimize normalization for large objects
- Cache enrichment results
- Monitor transformation time
- Use efficient data structures
