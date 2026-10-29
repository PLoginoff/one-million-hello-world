# API Gateway Layer Architecture

## Responsibility

API gateway abstraction: routing, transformation and request/response
lifecycle events. The layer receives an `ApiGatewayContext`
(`input`, `metadata`, `timestamp`) and returns
`ApiGatewayResult<T>`. Layer 26.

## Public contract

`interfaces/IApiGateway.ts` — `execute`, `configure`, `getStatus`.
`implementations/ApiGateway.ts` is the reference implementation; it
records success/failure counts and last execution time and wraps errors
as `APIGATEWAY_EXECUTION_ERROR`.

## Event processing

`domain/handlers/ApiGatewayEventProcessor.ts` processes the gateway
lifecycle defined in `domain/events/ApiGatewayEventTypes.ts`:
`REQUEST_RECEIVED`, `REQUEST_ROUTED`, `REQUEST_FORWARDED`,
`RESPONSE_RECEIVED`, `RESPONSE_SENT`, `RATE_LIMIT_EXCEEDED`,
`AUTH_FAILED`, `CIRCUIT_BREAKER_OPEN/CLOSED`,
`SERVICE_DISCOVERY_CHANGED`, `HEALTH_CHECK_FAILED/RECOVERED`,
`SSL_CERT_EXPIRING`, `CONFIG_RELOADED`, `CUSTOM_EVENT` — each with a
typed payload (`RequestReceivedPayload`, `RequestRoutedPayload`,
`RateLimitExceededPayload`, `AuthFailedPayload`, `CircuitBreakerPayload`,
`ServiceDiscoveryPayload`, `HealthCheckPayload`, `SslCertPayload`,
`ConfigReloadedPayload`, …). The processor validates, enriches and routes
events to every registered adapter.

## Strategies

`IApiGatewayStrategy` (`strategies/`): `name`, `priority`, `canHandle`,
`execute` — `default` (0), `fast` (10), `reliable` (5), `cached` (7),
`batch` (3). `ApiGatewayStrategyFactory` instantiates by name. A
higher-level `ApiGatewayStrategy.ts` provides the legacy
default/optimized/fallback trio.

## Domain model

`domain/` — entities (`ApiGatewayEntity`, `ApiGatewayExecution`,
`ApiGatewayConfigState`, `ApiGatewayMetricsSnapshot`), value objects
(`ApiGatewayValueObject`, `ApiGatewayPriority`, `ApiGatewayThreshold`,
`ApiGatewayTimeWindow`), services (`ApiGatewayDomainService`,
`ExecutionService`, `QueryService`, `ValidationService`), command/query/
event handlers, specifications (`And`/`Or`/`Not`), policies
(`AccessPolicy`, `RatePolicy`), `ApiGatewayInMemoryRepository`,
`ApiGatewayProcessingPipeline`, caching/logging decorators,
`ApiGatewayMapper`, `ApiGatewayEventObserver`.

## Adapters

- `ApiGatewayInMemoryAdapter` — local map, for tests.
- `ApiGatewayMockAdapter` / `ApiGatewayStubAdapter` — canned and no-op
  responses.
- `HttpApiGatewayAdapter` — forwards events to external HTTP endpoints
  (Datadog, New Relic, custom) with batching and retries.
- `RedisApiGatewayAdapter` — persists events to Redis Streams and keeps
  metrics in Redis hashes/sorted sets.

## Configuration & observability

`configuration/` — `DEFAULT_APIGATEWAY_CONFIG`, fluent
`ApiGatewayConfigurationBuilder`, validators.
`statistics/ApiGatewayMetricsCollector`,
`metrics/ApiGatewayPrometheusMetricsCollector` and
`health/ApiGatewayHealthCheck` (execution-count, success-rate and
average-time checks aggregated into `healthy | degraded | unhealthy`).
