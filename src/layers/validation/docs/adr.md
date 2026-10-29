# ADR: Validation Layer

## Status
Accepted

## Context
Input needs declarative schema validation, sanitization, cross-field
and conditional rules, and observability (statistics, health,
diagnostics) before it reaches deeper layers.

## Decisions

### 1. Schema-first validation
`ValidationSchema` (`types/validation-types.ts`) declares fields,
rules, and formats; `Validator` (`implementations/Validator.ts`)
evaluates them into `ValidationResult` with typed `ValidationError`s
and `ValidationWarning`s — validation is data, not code.

### 2. Pluggable validation strategies
`strategies/strategy/` adds semantic strategy variants —
`RuleBasedValidationStrategy`, `SchemaValidationStrategy`,
`ConditionalValidationStrategy`, `CompositeValidationStrategy` — behind
`IValidationStrategy`, alongside the generic layer strategies and
`Logging`/`Metrics` decorator strategies.

### 3. Config-toggled features
`ValidationConfig` toggles `strictMode`, `sanitize`,
`enableAsyncValidation`, `enableCrossFieldValidation`,
`enableConditionalValidation`, `maxValidationTime`, and the
diagnostics/health/statistics switches — features are opt-in/out per
deployment, not per call.

### 4. Statistics and health built in
`ValidationMetrics`/`ValidationStatistics`, `ValidationHealthCheck`,
and `ValidationDiagnostics` expose pass rates, timing, and failure
breakdowns as first-class API rather than log scraping.

### 5. Multiple failure granularity
`stopOnFirstError`/`returnAllErrors` presets (`DefaultConfigs`) let
hosts trade speed for completeness; errors carry codes, fields, and
severity for per-field reporting.

## Consequences
- New rules land as schema/strategy additions, not validator edits.
- Broad toggle surface means config must be chosen deliberately —
  `DefaultConfigs` presets (`DEFAULT`/`STRICT`/`LENIENT`/`API`) capture
  the common profiles.
