# Gitops Layer Architecture

## Position
Layer 50. Responsibility: GitOps deployment reconciliation — desired-state (Git) vs observed-state reconciliation behind a uniform contract.

## Core Contract
`IGitops` (`interfaces/`): `execute(context: GitopsContext)`, `configure(config)`, `getStatus()` → `{ config, metrics, active }`.

`Gitops` (`implementations/`) returns `GitopsResult` (`{ success, data?, error? }`, code `GITOPS_EXECUTION_ERROR`) and records `successCount`/`failureCount`/`lastExecutionTime` metrics.

## Types (`types/gitops-types.ts`)
`GitopsContext` `{ input, metadata, timestamp }` — reconciliation inputs (repo ref, target environment, manifests) flow through `input`/`metadata`; `GitopsResult<T>`; `GitopsError`; `GitopsConfig` (`enabled`, `timeout`, `retries`, `logLevel`).

## Strategies (`strategies/`)
`IGitopsStrategy` (`name`/`priority`/`canHandle`/`execute`) implementations via `GitopsStrategyFactory`: `default` (0), `fast` (1), `reliable` (2), `batch` (3), `cached` (4). `batch` suits multi-environment reconciliation sweeps; `reliable` suits production applies.

## Domain Model (`domain/`)
Entities (`GitopsEntity`, `ConfigState`, `Execution`, `MetricsSnapshot`), value objects (`Priority`, `Threshold`, `TimeWindow` — sync windows), domain/execution/query/validation services, events (`GitopsExecuted`/`Failed` — drift-detected/apply-failed hooks), handlers, in-memory repository, mapper, decorators, observer, pipeline (reconcile stages), policies, specifications.

## Supporting
- `adapters/` — InMemory, Mock, Stub (extension points for Git providers and Kubernetes controllers)
- `configuration/` — builders, `DEFAULT_GITOPS_CONFIG`, validators
- `health/`, `metrics/` (Prometheus), `statistics/`, `utils/` (`GitopsError`, `GitopsErrorMapper`)
