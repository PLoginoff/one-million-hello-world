# Testing: Circuit Breaker Layer

## Test files

Top-level (`__tests__/`):

- `CircuitBreaker.test.ts` — the implementation: `getConfig`,
  `setConfig`, `getState` (starts `CLOSED`), `execute` with a
  `jest.fn()`-mocked operation, success/failure paths, open-circuit
  short-circuit and fallback behaviour.
- `CircuitBreakerConfiguration.test.ts` — defaults, builders
  (`CircuitBreakerConfigurationBuilder`, `CircuitConfigBuilder`),
  validators.
- `CircuitBreakerStrategies.test.ts` — `ICircuitBreakerStrategy`
  implementations: `Default`, `Fast`, `Reliable`, `Cached`, `Batch`,
  `Logging`, `Metrics` and the fallback strategies.

Domain (`domain/__tests__/`):

- `CircuitBreakerExtendedDomain.test.ts` — specifications, policies,
  repository, pipeline.
- `CircuitBreakerServices.test.ts` — execution/query/validation
  services.
- `CircuitBreakerPatterns.test.ts` — mapper, decorators, observer.

## Running

```bash
bun test ./src/layers/circuit-breaker/
```

Bun provides the `jest` global (`jest.fn()`, `describe`, `it`) the tests
use — no Jest installation needed.

## Conventions

- Operations and fallbacks are `jest.fn()` mocks resolving/rejecting
  inline — no timers or real I/O.
- State transitions are driven by repeatedly calling `execute` with a
  failing mock until `failureThreshold` is reached, then asserting
  `getState()`.
- The reset timeout is not slept; tests either call `reset()` or
  manipulate `setConfig` to shrink `resetTimeout` to 0 before probing.
