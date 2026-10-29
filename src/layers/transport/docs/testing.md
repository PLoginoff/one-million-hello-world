# Testing: Transport Layer

## Test Files

| File | Scope |
|------|-------|
| `__tests__/Transport.test.ts` | `Transport`: `getConfig`/`setConfig` merge, `send` success/failure envelope |
| `__tests__/TransportStrategies.test.ts` | Generic strategies + `TransportStrategyFactory` |
| `__tests__/TransportConfiguration.test.ts` | `TransportConfigurationBuilder`, `TransportConfigurationValidator` |
| `domain/__tests__/TransportExtendedDomain.test.ts` | `TransportExecution`, `TransportThreshold`, `TransportTimeWindow`, `TransportPriority`, `TransportExecuted`/`TransportFailed` events |
| `domain/__tests__/TransportPatterns.test.ts` | Access/rate policies, specifications, observer, pipeline, decorators, event handler |
| `domain/__tests__/TransportServices.test.ts` | Execution/validation/query services, repository, mapper, handlers |

## Running Tests

```bash
bun test ./src/layers/transport/
```

Single file:

```bash
bun test ./src/layers/transport/__tests__/Transport.test.ts
```

Tests use `bun:test` (`describe`/`it`/`expect`). `send` never rejects —
both success and failure paths resolve a `TransportResult`, so tests
assert on `success`/`status`/`error` fields.
