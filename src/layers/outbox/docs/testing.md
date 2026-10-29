# Testing: Outbox Layer

## Test Files

### `__tests__/`
- `Outbox.test.ts` — generic `Outbox` implementation:
  execute/configure/getStatus.
- `OutboxStrategies.test.ts` — the five `IOutboxStrategy`
  implementations against `OutboxStrategyContext`.
- `OutboxConfiguration.test.ts` — builder, validator, defaults.

### `domain/__tests__/`
- `OutboxDomain.test.ts`, `OutboxExtendedDomain.test.ts` — entities and
  value objects.
- `OutboxPatterns.test.ts` — specifications, decorators, pipeline.
- `OutboxServices.test.ts` — domain/execution/query/validation services.

## Running Tests

```bash
bun test ./src/layers/outbox/
```

Single file:

```bash
bun test ./src/layers/outbox/__tests__/Outbox.test.ts
```

## Test Approach
- The `InMemoryAdapter` implements the full `IOutboxAdapter` contract, so
  tests exercise the real `saveMessage` → `markProcessed`/`markFailed`
  → `archiveMessage` lifecycle without external services.
- Error paths are covered via the typed error hierarchy
  (`MaxRetriesExceededError`, `MessageAlreadyProcessedError`, …).
- Strategy tests assert `canHandle` + `execute` against
  `OutboxStrategyContext` fixtures.
