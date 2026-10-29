# Data Transformation Layer Architecture

## Position
Layer 15 of the 25-layer architecture. Responsibility: normalization, enrichment, and field mapping of data flowing through the pipeline.

## Core Contract
`IDataTransformer` (`interfaces/IDataTransformer.ts`) exposes four operations:

- `normalize<T>(data): TransformationResult<T>` — trims/lowercases string properties (skippable via `enableNormalization: false`)
- `enrich<T>(data, enrichment): TransformationResult<T>` — merges `EnrichmentData` fields into the record (skippable via `enableEnrichment: false`)
- `map<T, U>(data, rules): TransformationResult<U>` — applies `TransformationRule[]` (source→target field mapping with optional transform functions); fails if the data isn't an object or a source field is missing
- `transform<T, U>(data, rules?, enrichment?): TransformationResult<U>` — full pipeline: normalize → enrich → map

`DataTransformer` (`implementations/DataTransformer.ts`) implements it, holding a `TransformationConfig` exposed via `getConfig()`/`setConfig()`. All operations are non-destructive (input objects are copied, not mutated) and return `TransformationResult { success, data?, errors? }`.

## Strategies (`strategies/`)
Five `IDataTransformationStrategy` implementations — `default`, `fast`, `reliable`, `cached`, `batch` — via `DataTransformationStrategyFactory`, sharing the standard layer `Context → Result` shape.

## Domain Model (`domain/`)
Entities, value objects (`DataTransformationPriority`, `Threshold`, `TimeWindow`), domain/execution/query/validation services, events, handlers, in-memory repository, mapper, decorators, observer, pipeline, policies, And/Or/Not specifications — tested by `domain/__tests__/`.

## Supporting
- `adapters/` — InMemory, Mock, Stub
- `configuration/` — builders, `DEFAULT_DATATRANSFORMATION_CONFIG`, validators
- `health/DataTransformationHealthCheck`, `metrics/` Prometheus collector, `statistics/` collector
- `utils/` — `DataTransformationError`, `DataTransformationErrorMapper`

## Detail docs
- `normalization.md` — normalization rules in depth
- `enrichment.md` — enrichment sources and merging
- `mapping.md` — transformation rule syntax
- `combined-transformation.md` — the `transform()` pipeline
