# Configuration: Retry Layer

The real configuration type is `RetryConfig` in `types/retry-types.ts`.

## RetryConfig

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxAttempts` | `number` | `3` | Total attempts (initial + retries) |
| `strategy` | `RetryStrategy` | `EXPONENTIAL_BACKOFF` | Delay strategy |
| `baseDelay` | `number` | `1000` | Base delay in ms |
| `maxDelay` | `number` | `10000` | Delay cap in ms |
| `jitter` | `boolean` | `true` | ±10% random jitter |

Defaults are applied in `implementations/RetryPolicy.ts`.

## RetryStrategy

`EXPONENTIAL_BACKOFF` (`baseDelay * 2^attempt`), `LINEAR_BACKOFF`
(`baseDelay * (attempt+1)`), `FIXED_DELAY` (`baseDelay`), all capped at
`maxDelay`; jitter adds ±10% randomness to prevent thundering herd — see
[delay-calculation.md](delay-calculation.md) and
[jitter-implementation.md](jitter-implementation.md).

## Pipeline strategies

`IRetryStrategy` in `strategies/` is a different abstraction — generic
execution strategies (`Default`, `Fast`, `Reliable`, `Cached`, `Batch`)
plus `DefaultRetryStrategy`, `LoggingRetryStrategy`,
`MetricsRetryStrategy` created via `RetryStrategyFactory`.
