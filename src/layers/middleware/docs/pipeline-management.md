# Pipeline Management

## Overview
The Middleware Layer organizes cross-cutting concerns into pipelines. A `MiddlewarePipeline` is a named, ordered collection of `PipelineStage` entries that can be toggled on or off. Pipelines are stored and managed by `MiddlewareManager` (via `IMiddlewareManager`); execution of registered middleware is performed by `MiddlewarePipelineService` in `domain/services`.

## Pipeline Types

### Pipeline and Stage Shapes
Defined in `types/middleware-types.ts`:
```typescript
interface MiddlewarePipeline {
  name: string;
  stages: PipelineStage[];
  enabled: boolean;
  config?: Record<string, unknown>;
}

interface PipelineStage {
  name: string;
  type: StageType;
  order: number;
  enabled: boolean;
  config?: Record<string, unknown>;
}

enum StageType {
  LOGGING = 'LOGGING',
  METRICS = 'METRICS',
  TRACING = 'TRACING',
  CORRELATION = 'CORRELATION',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  CACHING = 'CACHING',
  RATE_LIMITING = 'RATE_LIMITING',
  CUSTOM = 'CUSTOM',
}
```

### Execution Order and Priority
Domain ordering is expressed by `MiddlewareExecutionOrderValueObject` (`first`, `before`, `after`, `last`) and `MiddlewarePriority` on each `MiddlewareEntity`. `MiddlewarePipelineService.reorder()` places `first` middleware ahead, `last` middleware behind, and sorts the rest by before/after hint then `priority`.

## Managing Pipelines

### IMiddlewareManager API
`MiddlewareManager` exposes the full pipeline lifecycle:
```typescript
manager.addPipeline(pipeline: MiddlewarePipeline): void;
manager.removePipeline(pipelineName: string): void;
manager.getPipeline(pipelineName: string): MiddlewarePipeline | undefined;
manager.getPipelines(): MiddlewarePipeline[];
manager.addPipelineStage(pipelineName: string, stage: PipelineStage): void;
manager.removePipelineStage(pipelineName: string, stageName: string): void;
manager.enablePipeline(pipelineName: string): void;
manager.disablePipeline(pipelineName: string): void;
```

### Example: Registering a Pipeline
```typescript
const pipeline: MiddlewarePipeline = {
  name: 'request-pipeline',
  enabled: true,
  stages: [
    { name: 'correlation', type: StageType.CORRELATION, order: 0, enabled: true },
    { name: 'logging', type: StageType.LOGGING, order: 1, enabled: true },
    { name: 'metrics', type: StageType.METRICS, order: 2, enabled: true },
    { name: 'tracing', type: StageType.TRACING, order: 3, enabled: true, config: { sampleRate: 0.1 } },
  ],
};

manager.addPipeline(pipeline);
manager.disablePipeline('request-pipeline'); // toggle off without removing
manager.enablePipeline('request-pipeline');
```

### Adding and Removing Stages
```typescript
manager.addPipelineStage('request-pipeline', {
  name: 'rate-limit',
  type: StageType.RATE_LIMITING,
  order: 4,
  enabled: true,
  config: { limit: 100 },
});

manager.removePipelineStage('request-pipeline', 'rate-limit');
```

## Pipeline Execution

### MiddlewarePipelineService
`MiddlewarePipelineService` executes `PipelineHandler` functions in order against a `MiddlewareContextEntity`. Disabled entities are skipped; the (possibly mutated) context is returned.

```typescript
type PipelineHandler = (
  context: MiddlewareContextEntity
) => Promise<MiddlewareContextEntity> | MiddlewareContextEntity;

const service = new MiddlewarePipelineService();
service.add(entity, handler, MiddlewareExecutionOrderValueObject.before());
service.remove(entity.data.id);
const result = await service.execute(context);
service.clear(); // reset
```

### Related Services
- `MiddlewareChainService` — composes middleware into chain-of-responsibility.
- `MiddlewareExecutionService` — tracks `MiddlewareExecution` records and publishes `MiddlewareExecuted`/`MiddlewareFailed` domain events.
- `MiddlewareQueryService` / `MiddlewareValidationService` — lookup and config validation.
- `MiddlewareProcessingPipeline` (infrastructure) — full processing pipeline wiring.

## Custom Stages
Custom behavior is expressed as a `StageType.CUSTOM` stage in a `MiddlewarePipeline`, or as a middleware entity + handler pair in `MiddlewarePipelineService`:

```typescript
service.add(
  new MiddlewareEntity({ id: 'timing', name: 'Request Timing', priority: 10, enabled: true }),
  async (ctx) => {
    ctx.setMetadata('startTime', Date.now());
    return ctx;
  },
  MiddlewareExecutionOrderValueObject.first(),
);
```

## Best Practices

### Pipeline Design
- Keep stages focused and single-purpose; order them with `MiddlewareExecutionOrderValueObject` rather than relying on registration order.
- Correlation and logging belong early (`first`/`before`); terminal handlers use `last`.
- Use `enablePipeline`/`disablePipeline` for environment-based toggles instead of deleting pipelines.
- Let stage failures propagate so `MiddlewareFailed` events and error handling stay consistent.

### Configuration
- Tune `MiddlewareConfig` (`enableLogging`, `enableMetrics`, `enableTracing`, `enableCorrelation`, `logLevel`, `metricsFlushInterval`, `spanSamplingRate`, `enableStructuredLogging`, `logOutputFormat`, `logOutputTarget`) via `manager.setConfig()`.
- Use `MiddlewareConfigBuilder`/`MiddlewareConfigurationBuilder` and `DefaultConfigs` for validated presets.

### Performance
- Keep handlers async for I/O-bound work; use `ParallelExecutionStrategy` where order does not matter.
- Enable `enableSpanSampling`/`spanSamplingRate` in production to bound trace volume.
- Inspect `manager.getStatistics()` and `manager.getHealthStatus()` to monitor pipeline overhead.
