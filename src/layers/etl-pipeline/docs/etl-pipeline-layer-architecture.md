# EtlPipeline Layer Architecture

## Position
Layer 78. Responsibility: ETL pipeline orchestration — extract/transform/load operations behind a uniform contract.

## Core Contract
`IEtlPipeline` (`interfaces/`): `execute(context: EtlPipelineContext)`, `configure(config)`, `getStatus()` → `{ config, metrics, active }`.

`EtlPipeline` (`implementations/`) returns `EtlPipelineResult` (`{ success, data?, error? }`, code `ETLPIPELINE_EXECUTION_ERROR`) and records `successCount`/`failureCount`/`lastExecutionTime` metrics.

## Types (`types/etl-pipeline-types.ts`)
`EtlPipelineContext` `{ input, metadata, timestamp }` — pipeline definitions/data flow through `input`; `EtlPipelineResult<T>`; `EtlPipelineError`; `EtlPipelineConfig` (`enabled`, `timeout`, `retries`, `logLevel`).

## Strategies (`strategies/`)
`IEtlPipelineStrategy` (`name`/`priority`/`canHandle`/`execute`) implementations via `EtlPipelineStrategyFactory`: `default` (0), `fast` (1), `reliable` (2), `batch` (3), `cached` (4). `batch` maps naturally to bulk ETL runs; `reliable` to pipelines where partial failure is unacceptable.

## Domain Model (`domain/`)
Entities (`EtlPipelineEntity`, `ConfigState`, `Execution`, `MetricsSnapshot`), value objects (`Priority`, `Threshold`, `TimeWindow`), domain/execution/query/validation services, events (`EtlPipelineExecuted`/`Failed`), handlers, in-memory repository, mapper, decorators, observer, pipeline (processing stages), policies, specifications.

## Supporting
- `adapters/` — InMemory, Mock, Stub (extension points for real source/sink connectors)
- `configuration/` — builders, `DEFAULT_ETLPIPELINE_CONFIG`, validators
- `health/`, `metrics/` (Prometheus), `statistics/`, `utils/` (`EtlPipelineError`, `EtlPipelineErrorMapper`)
