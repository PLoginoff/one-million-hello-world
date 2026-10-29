# ADR: Serialization Layer

## Status
Accepted

## Context
Response serialization needs multi-format support (JSON/XML/string),
HTTP content negotiation, versioning, validation, and extensibility —
with each concern independently replaceable.

## Decisions

### 1. Strategy pattern for formats and versioning
- Formats: `JSONStrategy`, `XMLStrategy`, `StringStrategy` behind
  `ISerializationStrategy` (`serialize`/`deserialize`/`getContentType`/
  `getFormatName`/`canSerialize`/`canDeserialize`), selected via
  `SerializationStrategyFactory`/`StrategyRegistry`.
- Versioning: `WrapperVersioningStrategy`, `HeaderVersioningStrategy`,
  `CustomVersioningStrategy` behind `IVersioningStrategy`
  (`applyVersioning`/`extractVersion`/`isVersioned`), managed by
  `VersioningManager`.

### 2. Chain of Responsibility for negotiation and validation
`ContentNegotiationManager` chains `INegotiator`s (JSON/XML/text) with
Accept-header q-values and a JSON fallback; `ValidationPipeline` chains
`IValidator`s (type, schema) collecting errors and warnings.

### 3. Plugins and hooks for orthogonal concerns
`PluginManager` runs `ISerializationPlugin`s (lifecycle + before/after
serialize/deserialize); `HookManager` runs `SerializationHook`s by
`HookType` and priority (`BEFORE/AFTER_SERIALIZE`,
`BEFORE/AFTER_DESERIALIZE`, `ON_ERROR`).

### 4. Extended result envelope
`ExtendedSerializationResult` carries `version`,
`validationErrors`/`Warnings`, and `SerializationError` carries
`code`/`context`/`innerError`/`timestamp` — failures are data, not just
throws.

### 5. Supporting infrastructure co-located
`SerializerBuilder`, `DIContainer`, `MiddlewarePipeline`,
`SerializationEventEmitter`, `Cache`, `ResiliencePatterns`,
`Metrics`, `CompositeValidator`, and config (`ConfigLoader`,
`ConfigSchema`, `ConfigValidator`) complete the subsystem.

## Consequences
- Very extensible but many moving parts; each pattern adds indirection.
- XML support is intentionally basic.
- Async strategy API keeps non-blocking hosts unblocked.
