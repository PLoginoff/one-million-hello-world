# Pipeline Management

## Overview
The Middleware Layer uses a pipeline architecture to organize and execute middleware operations in a modular, configurable manner. Pipelines allow for flexible composition of cross-cutting concerns.

## Pipeline Architecture

### Pipeline Stage Types
```typescript
enum PipelineStageType {
  LOGGING = 'logging',
  METRICS = 'metrics',
  TRACING = 'tracing',
  CORRELATION = 'correlation',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  CACHING = 'caching',
  RATE_LIMITING = 'rate-limiting',
  CUSTOM = 'custom'
}
```

### Pipeline Stage Definition
```typescript
interface PipelineStage {
  id: string;
  type: PipelineStageType;
  name: string;
  order: number;
  enabled: boolean;
  config: any;
  handler: (context: MiddlewareContext) => Promise<void>;
}

interface MiddlewareContext {
  request: HttpRequest;
  response?: HttpResponse;
  metadata: Map<string, any>;
  correlationContext: CorrelationContext;
  span?: Span;
}
```

### Pipeline Implementation
```typescript
class Pipeline {
  private stages: Map<string, PipelineStage> = new Map();
  private enabled: boolean = true;
  
  addStage(stage: PipelineStage): void {
    this.stages.set(stage.id, stage);
    this.reorderStages();
  }
  
  removeStage(stageId: string): void {
    this.stages.delete(stageId);
  }
  
  enable(): void {
    this.enabled = true;
  }
  
  disable(): void {
    this.enabled = false;
  }
  
  isEnabled(): boolean {
    return this.enabled;
  }
  
  async execute(context: MiddlewareContext): Promise<void> {
    if (!this.enabled) {
      return;
    }
    
    const sortedStages = this.getSortedStages();
    
    for (const stage of sortedStages) {
      if (!stage.enabled) {
        continue;
      }
      
      try {
        await stage.handler(context);
      } catch (error) {
        this.logger.error(`Pipeline stage ${stage.name} failed`, { error, stageId: stage.id });
        throw error;
      }
    }
  }
  
  private getSortedStages(): PipelineStage[] {
    return Array.from(this.stages.values()).sort((a, b) => a.order - b.order);
  }
  
  private reorderStages(): void {
    // Reorder stages based on order property
    const sorted = this.getSortedStages();
    let order = 0;
    for (const stage of sorted) {
      stage.order = order++;
    }
  }
  
  getStage(stageId: string): PipelineStage | undefined {
    return this.stages.get(stageId);
  }
  
  getAllStages(): PipelineStage[] {
    return this.getSortedStages();
  }
}
```

### Pipeline Manager
```typescript
class PipelineManager {
  private pipelines: Map<string, Pipeline> = new Map();
  
  createPipeline(name: string): Pipeline {
    const pipeline = new Pipeline();
    this.pipelines.set(name, pipeline);
    return pipeline;
  }
  
  getPipeline(name: string): Pipeline | undefined {
    return this.pipelines.get(name);
  }
  
  getAllPipelines(): Pipeline[] {
    return Array.from(this.pipelines.values());
  }
  
  deletePipeline(name: string): void {
    this.pipelines.delete(name);
  }
}
```

## Built-in Pipeline Stages

### Logging Stage
```typescript
class LoggingStage implements PipelineStage {
  id = 'logging-stage';
  type = PipelineStageType.LOGGING;
  name = 'Logging';
  order = 0;
  enabled = true;
  config: LoggingConfig;
  
  constructor(config: LoggingConfig) {
    this.config = config;
  }
  
  async handler(context: MiddlewareContext): Promise<void> {
    const { request } = context;
    
    this.logger.info('Request received', {
      method: request.method,
      uri: request.uri,
      headers: Array.from(request.headers.entries()),
      correlationId: context.correlationContext.correlationId
    });
  }
}
```

### Metrics Stage
```typescript
class MetricsStage implements PipelineStage {
  id = 'metrics-stage';
  type = PipelineStageType.METRICS;
  name = 'Metrics';
  order = 1;
  enabled = true;
  config: MetricsConfig;
  
  constructor(config: MetricsConfig) {
    this.config = config;
  }
  
  async handler(context: MiddlewareContext): Promise<void> {
    const { request } = context;
    
    this.metricsCollector.increment('http.requests.total', 1, {
      method: request.method,
      uri: request.uri
    });
  }
}
```

### Tracing Stage
```typescript
class TracingStage implements PipelineStage {
  id = 'tracing-stage';
  type = PipelineStageType.TRACING;
  name = 'Tracing';
  order = 2;
  enabled = true;
  config: TracingConfig;
  
  constructor(config: TracingConfig) {
    this.config = config;
  }
  
  async handler(context: MiddlewareContext): Promise<void> {
    const span = this.tracer.startSpan('middleware-request', context.span?.spanId);
    context.span = span;
    
    span.setTag('http.method', context.request.method);
    span.setTag('http.uri', context.request.uri);
  }
}
```

### Correlation Stage
```typescript
class CorrelationStage implements PipelineStage {
  id = 'correlation-stage';
  type = PipelineStageType.CORRELATION;
  name = 'Correlation';
  order = 3;
  enabled = true;
  config: CorrelationConfig;
  
  constructor(config: CorrelationConfig) {
    this.config = config;
  }
  
  async handler(context: MiddlewareContext): Promise<void> {
    if (!context.correlationContext) {
      context.correlationContext = this.correlationManager.createContext(
        context.request.securityContext?.userId
      );
    }
  }
}
```

## Custom Pipeline Stages

### Custom Stage Definition
```typescript
class CustomStage implements PipelineStage {
  id: string;
  type = PipelineStageType.CUSTOM;
  name: string;
  order: number;
  enabled = true;
  config: any;
  handler: (context: MiddlewareContext) => Promise<void>;
  
  constructor(id: string, name: string, handler: (context: MiddlewareContext) => Promise<void>, config?: any) {
    this.id = id;
    this.name = name;
    this.handler = handler;
    this.config = config || {};
  }
}
```

### Custom Stage Examples
```typescript
// Request timing stage
const timingStage = new CustomStage(
  'timing-stage',
  'Request Timing',
  async (context) => {
    const startTime = Date.now();
    context.metadata.set('startTime', startTime);
  }
);

// Request validation stage
const validationStage = new CustomStage(
  'validation-stage',
  'Request Validation',
  async (context) => {
    const validation = await validateRequest(context.request);
    if (!validation.valid) {
      throw new ValidationError(validation.errors);
    }
  }
);

// Cache lookup stage
const cacheLookupStage = new CustomStage(
  'cache-lookup-stage',
  'Cache Lookup',
  async (context) => {
    const cacheKey = generateCacheKey(context.request);
    const cached = await cache.get(cacheKey);
    
    if (cached) {
      context.metadata.set('cached', true);
      context.response = cached;
    }
  }
);
```

## Pipeline Configuration

### Pipeline Configuration
```typescript
interface PipelineConfig {
  name: string;
  enabled: boolean;
  stages: PipelineStageConfig[];
}

interface PipelineStageConfig {
  id: string;
  type: PipelineStageType;
  name: string;
  order: number;
  enabled: boolean;
  config: any;
}
```

### Pipeline Builder
```typescript
class PipelineBuilder {
  private config: PipelineConfig;
  
  constructor(name: string) {
    this.config = {
      name,
      enabled: true,
      stages: []
    };
  }
  
  addLogging(config: LoggingConfig): PipelineBuilder {
    this.config.stages.push({
      id: 'logging-stage',
      type: PipelineStageType.LOGGING,
      name: 'Logging',
      order: this.config.stages.length,
      enabled: true,
      config
    });
    return this;
  }
  
  addMetrics(config: MetricsConfig): PipelineBuilder {
    this.config.stages.push({
      id: 'metrics-stage',
      type: PipelineStageType.METRICS,
      name: 'Metrics',
      order: this.config.stages.length,
      enabled: true,
      config
    });
    return this;
  }
  
  addTracing(config: TracingConfig): PipelineBuilder {
    this.config.stages.push({
      id: 'tracing-stage',
      type: PipelineStageType.TRACING,
      name: 'Tracing',
      order: this.config.stages.length,
      enabled: true,
      config
    });
    return this;
  }
  
  addCorrelation(config: CorrelationConfig): PipelineBuilder {
    this.config.stages.push({
      id: 'correlation-stage',
      type: PipelineStageType.CORRELATION,
      name: 'Correlation',
      order: this.config.stages.length,
      enabled: true,
      config
    });
    return this;
  }
  
  addCustom(stage: PipelineStageConfig): PipelineBuilder {
    this.config.stages.push(stage);
    return this;
  }
  
  build(): Pipeline {
    const pipeline = new Pipeline();
    
    for (const stageConfig of this.config.stages) {
      const stage = this.createStage(stageConfig);
      pipeline.addStage(stage);
    }
    
    if (!this.config.enabled) {
      pipeline.disable();
    }
    
    return pipeline;
  }
  
  private createStage(config: PipelineStageConfig): PipelineStage {
    switch (config.type) {
      case PipelineStageType.LOGGING:
        return new LoggingStage(config.config);
      case PipelineStageType.METRICS:
        return new MetricsStage(config.config);
      case PipelineStageType.TRACING:
        return new TracingStage(config.config);
      case PipelineStageType.CORRELATION:
        return new CorrelationStage(config.config);
      case PipelineStageType.CUSTOM:
        return new CustomStage(
          config.id,
          config.name,
          () => Promise.resolve(), // Handler would be provided separately
          config.config
        );
      default:
        throw new Error(`Unknown stage type: ${config.type}`);
    }
  }
}
```

## Best Practices

### Pipeline Design Guidelines
- Keep stages focused and single-purpose
- Order stages appropriately (correlation first, then logging, etc.)
- Use descriptive stage names
- Enable/disable stages based on environment
- Handle errors gracefully in stages
- Log stage execution for debugging

### Stage Configuration Guidelines
- Configure stages for production use
- Use appropriate log levels for different environments
- Configure sampling for tracing in production
- Set appropriate metric flush intervals
- Enable correlation ID propagation

### Performance Considerations
- Use async operations for I/O-bound stages
- Implement stage caching where appropriate
- Use efficient data structures
- Minimize stage overhead
- Profile pipeline performance
