# Configuration: RateLimiting Layer

The real configuration type is `RateLimitConfig` in
`types/rate-limiting-types.ts`.

## RateLimitConfig

| Option | Type | Description |
|--------|------|-------------|
| `requestsPerWindow` | `number` | Requests allowed per window |
| `windowSizeMs` | `number` | Window length in ms |
| `burstSize` | `number` | Extra burst capacity |
| `strategy` | `RateLimitStrategy` | Algorithm to use |
| `enabled` | `boolean` | Enable/disable limiting |
| `skipSuccessfulRequests` | `boolean` | Don't count successful requests |
| `skipFailedRequests` | `boolean` | Don't count failed requests |
| `enableBurstProtection` | `boolean` | Apply burst cap |
| `enableGracePeriod` / `gracePeriodMs` | `boolean` / `number` | Soft-limit grace period |
| `enablePriorityQueuing` / `maxQueueSize` | `boolean` / `number` | Queue instead of reject |

## RateLimitStrategy

`TOKEN_BUCKET`, `SLIDING_WINDOW`, `FIXED_WINDOW`, `LEAKY_BUCKET` — each maps
to a class under `strategies/algorithm/`
(`TokenBucketStrategy`, `SlidingWindowStrategy`, `FixedWindowStrategy`,
`LeakyBucketStrategy`) implementing `IRateLimitAlgorithm`.

## Identifiers and scoping

`RateLimitIdentifier` (`type` + `value`) scopes limits by
`IP_ADDRESS`, `USER_ID`, `API_KEY` or `CUSTOM` — see
[identifiers-scopes.md](identifiers-scopes.md). Domain entities
`RateLimitKey` and `RateLimitRequest` carry the scoped request.

## Extended configs

The types file also defines `InternalLayerRateLimitConfig`,
`CrossLayerRateLimitConfig`, `RateLimitCascadeConfig` and
`AdaptiveRateLimitConfig` for multi-layer and adaptive limiting.

## Decorator strategies

`LoggingRateLimitingStrategy`/`LoggingStrategy` and
`MetricsRateLimitingStrategy`/`MetricsStrategy` wrap a limiter to add
logging/metrics; `CachedStrategy`, `BatchStrategy`, `FastStrategy`,
`ReliableStrategy`, `DefaultStrategy` are the generic pipeline strategies
created via `RateLimitingStrategyFactory` / `RateLimitFactory`.
