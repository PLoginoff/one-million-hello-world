# Testing: Notification Layer

## Test Files

### `__tests__/`
- `Notification.test.ts` — implementation: `execute` happy and error paths,
  `configure`, `getStatus` shape (config, metrics, active).
- `NotificationStrategies.test.ts` — all five strategies: `canHandle`,
  `execute` results, execution counting.
- `NotificationConfiguration.test.ts` — builder and validator behavior.

### `domain/__tests__/`
- `NotificationDomain.test.ts`, `NotificationExtendedDomain.test.ts` — entities and
  value objects.
- `NotificationPatterns.test.ts` — specifications, decorators, pipeline.
- `NotificationServices.test.ts` — domain/execution/query/validation services.

## Running Tests

```bash
bun test ./src/layers/notification/
```

Single file:

```bash
bun test ./src/layers/notification/__tests__/Notification.test.ts
```

## Test Approach
- Strategies are tested against the shared `INotificationStrategy` contract:
  `canHandle` accepts non-null input, `execute` returns
  `{ success, data: { strategy, input, metadata, executionCount } }`.
- `InMemoryAdapter` / `MockAdapter` / `StubAdapter` isolate the layer
  from external systems.
- Implementation tests verify metric recording (`successCount`,
  `failureCount`, `lastExecutionTime`) via `getStatus()`.
