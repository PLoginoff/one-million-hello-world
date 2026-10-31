# Combined Transformation

## Overview
The Data Transformation Layer runs normalization → enrichment → mapping as a single `transform()` call on `implementations/DataTransformer.ts` (`IDataTransformer`). The three stages are gated by flags in `TransformationConfig`; there is no separate `TransformationPipeline`/`PipelineBuilder` class — orchestration is a method on `DataTransformer`, and `DataTransformationProcessingPipeline` (domain/pipelines) wires domain-side processing.

## Types (`types/data-transformation-types.ts`)

```typescript
interface TransformationRule {
  sourceField: string;
  targetField: string;
  transform?: (value: unknown) => unknown;
}

interface EnrichmentData {
  source: string;
  data: Record<string, unknown>;
}

interface TransformationResult<T> {
  success: boolean;
  data?: T;
  errors?: string[];
}

interface TransformationConfig {
  enableNormalization: boolean;
  enableEnrichment: boolean;
  enableMapping: boolean;
}
```

## API

```typescript
const transformer = new DataTransformer();

// Individual stages
transformer.normalize(data): TransformationResult<T>;
transformer.enrich(data, enrichment): TransformationResult<T>;
transformer.map(data, rules): TransformationResult<U>;

// Combined: normalization → enrichment → mapping
transformer.transform(data, rules?, enrichment?): TransformationResult<U>;

transformer.setConfig({ enableNormalization: true, enableEnrichment: true, enableMapping: true });
transformer.getConfig();
```

- `transform` short-circuits on a failed stage and returns `success: false` with `errors`.
- Each stage honors its `enable*` flag; a disabled stage is a passthrough.
- `enrich` merges `enrichment.data` under the given `source`; `map` applies `TransformationRule`s (field rename + optional `transform` fn).

## Engine Components

`engine/` contains the building blocks used by `DataTransformer`:

- `TransformationEngine` — executes rule-based transforms.
- `MappingEngine` / `Path` — field mapping and nested-path access.
- `Enricher` — merges `EnrichmentData` sources.
- `Coercer` / `Validators` / `Transforms` — type coercion and built-in transform functions.
- `Aggregator` / `BatchTransformer` — multi-record transforms (see `strategies/BatchStrategy.ts`).

## Error Handling

Failures surface as `TransformationResult.success === false` with `errors: string[]`; layer errors are produced by `utils/DataTransformationError.ts` and mapped by `DataTransformationErrorMapper`. Domain-side, `DataTransformationExecutionService` emits `DataTransformationExecuted`/`DataTransformationFailed` events.

## Best Practices

### Pipeline Guidelines
- Order matters: normalize first so mapping sees clean field names/types, then enrich, then map.
- Toggle stages via `TransformationConfig` flags rather than building separate pipelines.
- Return/inspect `TransformationResult.errors` instead of throwing on partial failures.

### Performance Considerations
- Use `BatchTransformer`/`BatchStrategy` for multi-record work.
- `CachedStrategy` memoizes repeated transforms; `FastStrategy` skips validation.
- Keep `transform` rules pure — they run per record.
