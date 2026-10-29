# Testing: Websocket Layer

## Test Files

| File | Scope |
|------|-------|
| `__tests__/Websocket.test.ts` | Facade: default config, `configure()`, `execute()` success path |
| `__tests__/WebsocketStrategies.test.ts` | All five strategies (name, priority, `execute()`, execution count) and `WebsocketStrategyFactory` (create/list/sort/unknown-name error) |
| `__tests__/WebsocketConfiguration.test.ts` | `WebsocketConfigurationBuilder` fluent API and `WebsocketConfigurationValidator` limits |
| `domain/__tests__/WebsocketDomain.test.ts` | `WebsocketEntity`, `WebsocketValueObject`, `WebsocketDomainService` |
| `domain/__tests__/WebsocketExtendedDomain.test.ts` | `WebsocketExecution`, `WebsocketThreshold`, `WebsocketTimeWindow`, `WebsocketPriority`, `WebsocketExecuted`/`WebsocketFailed` events |
| `domain/__tests__/WebsocketPatterns.test.ts` | Access/rate policies, And/Or/Not specifications, `WebsocketEventObserver`, `WebsocketProcessingPipeline`, caching/logging decorators, `WebsocketEventHandler` |
| `domain/__tests__/WebsocketServices.test.ts` | Execution/validation/query services, `WebsocketInMemoryRepository`, `WebsocketMapper`, command/query handlers |

## Running Tests

```bash
bun test ./src/layers/websocket/
```

Single file:

```bash
bun test ./src/layers/websocket/__tests__/WebsocketStrategies.test.ts
```

Tests use `bun:test` (`describe`/`it`/`expect`) and need no
external services — all strategies and adapters are in-memory.
