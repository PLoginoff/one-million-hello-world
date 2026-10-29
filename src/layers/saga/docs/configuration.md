# Configuration: Saga Layer

## Core config (`SagaConfig`)
`SagaManager` accepts `SagaConfig` (`types/saga-types.ts`):

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enableLogging` | boolean | false | Route step/compensation events through `Logger` |
| `enableCompensation` | boolean | true | Run reverse-order compensation on failure |

The orchestrator also receives an `OrchestratorConfig`
(`interfaces/ISagaOrchestrator.ts`) derived from it.

## Presets and builders (`configuration/`)
- `SagaDefaults` (`configuration/defaults/`) — default layer values.
- `SagaConfigBuilder` / `SagaConfigurationBuilder`
  (`configuration/builders/`) — fluent config construction.
- `SagaConfigValidator` / `SagaConfigurationValidator`
  (`configuration/validators/`) — validate config objects.

## Behavior notes
- Logging is off by default (`enableLogging: false`) to keep saga
  execution silent unless observability is requested.
- Compensation defaults **on** — opt out explicitly if steps are
  non-compensatable.
