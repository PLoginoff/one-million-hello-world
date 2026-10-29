# Fallback Strategies

Two levels of fallback exist: an inline `fallback` argument to
`execute()`, and pluggable `IFallbackStrategy` implementations under
`strategies/fallback/`.

## Inline fallback

`CircuitBreaker.execute(operation, fallback?)`:

- In `OPEN`, if `fallback` is supplied its result is returned instead of
  an error — degraded service while the circuit protects the backend.
- In `CLOSED`/`HALF_OPEN`, if `operation()` throws, `fallback()` is
  tried; its success becomes the call result (primary error swallowed),
  its failure returns the primary error.

## `IFallbackStrategy<T>` (`strategies/fallback/IFallbackStrategy.ts`)

```ts
interface IFallbackStrategy<T> {
  execute(context: FallbackContext<T>): Promise<FallbackResult<T>>;
  isAvailable(): boolean;
  getName(): string;
}
```

`FallbackContext<T>` carries `originalError`, `attemptCount`,
`lastAttemptTime`, `metadata`, `data`. `FallbackResult<T>` is
`{ success, data?, error?, fromFallback, strategyName }`.

## Implementations (`strategies/fallback/`)

- `DefaultFallbackStrategy` — generic fallback executing the context's
  supplied logic/value.
- `DefaultValueFallbackStrategy` — returns a pre-configured default
  `data` regardless of the error; ignores context (`_context`).
- `CacheFallbackStrategy` — serves a cached value when the primary
  failed; reports `fromFallback: true` and the strategy name.

## Decorator strategies

`strategies/LoggingCircuitBreakerStrategy.ts` and
`strategies/MetricsCircuitBreakerStrategy.ts` wrap another
`ICircuitBreakerStrategy` (`name` becomes `logging-<wrapped>`,
`metrics-<wrapped>`), adding a `ConsoleLogger`/`IStructuredLogger` or an
`InMemoryMetricsCollector` that counts `execution.fallback` events —
the seam where fallback usage is observed.
