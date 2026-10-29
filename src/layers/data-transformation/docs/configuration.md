# Configuration: Data Transformation Layer

## TransformationConfig
`DataTransformer` holds a `TransformationConfig` (`types/data-transformation-types.ts`) with three toggles:

| Option | Type | Effect |
|--------|------|--------|
| `enableNormalization` | boolean | `normalize()` step in `transform()`; when false, strings are left untouched |
| `enableEnrichment` | boolean | `enrich()` step; when false, `EnrichmentData` is ignored |
| `enableMapping` | boolean | `map()` step; when false, `TransformationRule[]` is ignored |

Read via `transformer.getConfig()`; update via `transformer.setConfig(partial)`.

## Layer defaults
`DEFAULT_DATATRANSFORMATION_CONFIG` (`configuration/defaults/`):

```ts
{ enabled: true, timeout: 30000, retries: 3, logLevel: 'info' }
```

## Enrichment shape
`EnrichmentData = { source: string; data: Record<string, unknown> }` — `data` is merged over the record; `source` labels where it came from.

## Mapping rules
`TransformationRule[]` — source→target field mappings with optional transform functions; see `mapping.md`.

## Builders/validators
`configuration/` provides `DataTransformationConfigurationBuilder` and validators for layer config.
