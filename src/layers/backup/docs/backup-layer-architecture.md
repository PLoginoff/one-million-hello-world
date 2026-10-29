# Backup Layer Architecture

## Responsibility

Backup and disaster recovery. The layer takes a `BackupContext` (`input`, `metadata`,
`timestamp`) and returns `BackupResult<T>` (`success`, `data` or
`error`).

## Public contract

`interfaces/IBackup.ts` — `execute(context)`, `configure(config)`,
`getStatus()`. `implementations/Backup.ts` is the reference
implementation; it records success/failure counts and last execution
time, and wraps errors as `BACKUP_EXECUTION_ERROR`.

## Strategies

`IBackupStrategy` (`strategies/`): `name`, `priority`, `canHandle`,
`execute`. Five implementations — `default` (0), `fast` (10),
`reliable` (5), `cached` (7), `batch` (3) — created by name via
`BackupStrategyFactory` (`create`, `createDefault`, `createAll`,
`registerStrategy`, `getAvailableStrategies`).

## Domain model

`domain/` is a self-contained DDD skeleton:

- **Entities** — `BackupEntity`, `BackupExecution`, `BackupConfigState`,
  `BackupMetricsSnapshot`.
- **Value objects** — `BackupValueObject`, `BackupPriority`,
  `BackupThreshold`, `BackupTimeWindow`.
- **Services** — `BackupDomainService`, `BackupExecutionService`,
  `BackupQueryService`, `BackupValidationService`.
- **Handlers** — `BackupCommandHandler`, `BackupQueryHandler`,
  `BackupEventHandler`; lifecycle events `BackupExecuted`/`BackupFailed`.
- **Specifications** — `IBackupSpecification` with `And`/`Or`/`Not`
  combinators.
- **Policies** — `BackupAccessPolicy`, `BackupRatePolicy`.
- **Repository** — `BackupInMemoryRepository`;
  **pipeline** — `BackupProcessingPipeline`; **decorators** —
  caching/logging; **mapper** — `BackupMapper`; **observer** —
  `BackupEventObserver`.

## Adapters

`BackupInMemoryAdapter`, `BackupMockAdapter`, `BackupStubAdapter`
(`adapters/`) — the in-memory variant stores responses in a local map;
mock/stub return canned/no-op responses. No remote adapter ships in this
layer; add one by implementing the same contract.

## Configuration & observability

`configuration/` — `BackupDefaults`, `BackupConfigurationBuilder`,
validators. `statistics/BackupMetricsCollector` (counts, timings, error
rates), `metrics/BackupPrometheusMetricsCollector` (Prometheus
exposition) and `health/BackupHealthCheck` aggregating execution-count,
success-rate and average-time checks into `healthy | degraded |
unhealthy`.
