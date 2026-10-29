# ADR: Data Transformation Layer

## Status
Accepted

## Context
Pipeline data needs normalization (consistent string forms), enrichment (added fields), and mapping (schema reshaping) before downstream layers consume it.

## Decisions

### 1. Three primitives + one pipeline method
`IDataTransformer` exposes `normalize`, `enrich`, `map` separately plus `transform()` which runs all three in order (normalize → enrich → map). Callers that need one step don't pay for the whole pipeline; callers that need all three get a defined order.

### 2. Non-destructive operations
All operations copy the input record rather than mutating it — a transformer must never corrupt data the caller still holds.

### 3. Toggleable steps via config
`TransformationConfig` carries `enableNormalization`/`enableEnrichment` flags — the same `transform()` call adapts without code changes.

### 4. Errors collected, not thrown
`map()` returns `TransformationResult { success: false, errors: [...] }` for missing source fields — a bad record reports all its problems at once instead of failing on the first.

### 5. Generic strategies + domain model
The standard five strategies and DDD domain model (specifications, policies, repository) give the transformation pipeline the same composability and testability surface as every other layer.

## Consequences
- Clear, testable transformation stages
- Rule-driven mapping without code changes
- String normalization is opinionated (trim + lowercase) — callers needing case preservation set `enableNormalization: false`
