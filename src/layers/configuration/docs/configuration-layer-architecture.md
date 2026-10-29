# Configuration Layer Architecture

## Responsibility

Configuration management and dynamic settings. Layer 30. The layer
takes a `ConfigurationContext` whose `input` is a config *key* and
returns `ConfigurationResult<T>` with the resolved value, or a
`CONFIG_NOT_FOUND` error.

## Public contract

`interfaces/IConfiguration.ts` — `execute`, `configure`, `getStatus`.
`implementations/Configuration.ts` is the reference implementation.

## Adapters — the actual resolution sources

Unlike most layers, `adapters/` is where this layer does its work:

- `EnvConfigAdapter(prefix = 'APP')` — resolves a key `foo` to
  `process.env.APP_FOO` (key uppercased, prefixed). Returns
  `CONFIG_NOT_FOUND` when the variable is unset.
- `FileConfigAdapter(filePath = '/etc/app/config.json')` — resolves
  keys from an in-memory map seeded via `configure({ filePath, values })`;
  returns `CONFIG_NOT_FOUND` for missing keys.

## Strategies & domain

Standard skeleton: five strategies (`default`, `fast`, `reliable`,
`cached`, `batch` via `ConfigurationStrategyFactory`) — `cached` is
the natural fit for config lookups; `domain/` contains entities
(`ConfigurationEntity`, `ConfigurationExecution`,
`ConfigurationConfigState`, `ConfigurationMetricsSnapshot`), value
objects (`ConfigurationPriority`, `ConfigurationThreshold`,
`ConfigurationTimeWindow`), services (domain/execution/query/
validation), command/query/event handlers
(`ConfigurationExecuted`/`ConfigurationFailed`), specifications,
policies, in-memory repository, pipeline, decorators, mapper, observer.

## Configuration & observability

`DEFAULT_CONFIGURATION_CONFIG` (`enabled`, `timeout`, `retries`,
`logLevel`), fluent `ConfigurationConfigurationBuilder`, validators,
`ConfigurationMetricsCollector`,
`ConfigurationPrometheusMetricsCollector`, `ConfigurationHealthCheck`
(`healthy | degraded | unhealthy`).
