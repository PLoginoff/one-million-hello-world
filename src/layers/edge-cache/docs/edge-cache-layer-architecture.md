# EdgeCache Layer Architecture

## Position
Layer 34. Responsibility: edge caching and CDN abstraction.

## Core Contract
`IEdgeCache` (`interfaces/`): `execute(context: EdgeCacheContext)`, `configure(config)`, `getStatus()` → `{ config, metrics, active }`.

`EdgeCache` (`implementations/`) returns `EdgeCacheResult` (`{ success, data?, error? }`, code `EDGECACHE_EXECUTION_ERROR`) and records `successCount`/`failureCount`/`lastExecutionTime` metrics.

## Types (`types/edge-cache-types.ts`)
`EdgeCacheContext` `{ input, metadata, timestamp }` — cache operations (get/set/purge) flow through `input`; `EdgeCacheResult<T>`; `EdgeCacheError`; `EdgeCacheConfig` (`enabled`, `timeout`, `retries`, `logLevel`).

## Strategies (`strategies/`)
`IEdgeCacheStrategy` (`name`/`priority`/`canHandle`/`execute`) implementations via `EdgeCacheStrategyFactory`: `default` (0), `fast` (1), `reliable` (2), `batch` (3), `cached` (4). The `cached` strategy adds a result cache over the underlying edge store — a meta-cache for repeated operations.

## Domain Model (`domain/`)
Entities (`EdgeCacheEntity`, `ConfigState`, `Execution`, `MetricsSnapshot`), value objects (`Priority`, `Threshold`, `TimeWindow` — TTL modeling), domain/execution/query/validation services, events (`EdgeCacheExecuted`/`Failed`), handlers, in-memory repository, mapper, caching/logging decorators, observer, pipeline, policies, specifications.

## Supporting
- `adapters/` — InMemory, Mock, Stub (extension points for real CDN providers: Cloudflare, Fastly, CloudFront)
- `configuration/` — builders, `DEFAULT_EDGECACHE_CONFIG`, validators
- `health/`, `metrics/` (Prometheus), `statistics/`, `utils/` (`EdgeCacheError`, `EdgeCacheErrorMapper`)
