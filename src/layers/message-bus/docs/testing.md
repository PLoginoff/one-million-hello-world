# Testing: MessageBus Layer

## Test Files

### `__tests__/`
- `MessageBus.test.ts` — implementation: `execute` happy path and error
  path, `configure`, `getStatus` shape (config, metrics, active).
- `MessageBusStrategies.test.ts` — all five strategies: `canHandle`
  contracts, `execute` results, execution counting.
- `MessageBusConfiguration.test.ts` — builder and validator behavior.

### `domain/__tests__/`
- `MessageBusDomain.test.ts` — entities and value objects.
- `MessageBusExtendedDomain.test.ts` — extended domain scenarios.
- `MessageBusPatterns.test.ts` — specifications, decorators, pipeline.
- `MessageBusServices.test.ts` — domain/execution/query/validation services.

## Running Tests

```bash
bun test ./src/layers/message-bus/
```

To run a single file:

```bash
bun test ./src/layers/message-bus/__tests__/MessageBusStrategies.test.ts
```

## Test Approach
- Strategies are tested against the shared `IMessageBusStrategy` contract:
  `canHandle` returns true for non-null input, `execute` returns
  `{ success: true, data: { strategy, input, metadata, executionCount } }`.
- `InMemoryAdapter` / `MockAdapter` / `StubAdapter` are used to isolate the
  layer from transport concerns.
- The implementation test verifies metric recording (`successCount`,
  `failureCount`, `lastExecutionTime`) via `getStatus()`.
