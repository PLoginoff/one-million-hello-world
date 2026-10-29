# Testing: API Gateway Layer

## Test files

Top-level (`__tests__/`):

- `ApiGateway.test.ts` — `execute`/`configure`/`getStatus` contract.
- `ApiGatewayStrategies.test.ts` — five strategies and factory
  creation/lookup.
- `ApiGatewayConfiguration.test.ts` — defaults, builder, validator.
- `ApiGatewayEventProcessor.test.ts` — the lifecycle event processor:
  registers `ApiGatewayInMemoryAdapter`, feeds each
  `ApiGatewayEventType` (`REQUEST_RECEIVED`, `RATE_LIMIT_EXCEEDED`,
  `AUTH_FAILED`, `CIRCUIT_BREAKER_*`, `SERVICE_DISCOVERY_*`,
  `HEALTH_CHECK_*`, `SSL_CERT_EXPIRING`, `CONFIG_RELOADED`) and asserts
  validation/enrichment/routing.

Domain (`domain/__tests__/`):

- `ApiGatewayDomain.test.ts` — entities, value objects, domain service.
- `ApiGatewayExtendedDomain.test.ts` — specifications, policies,
  repository, pipeline.
- `ApiGatewayServices.test.ts` — execution/query/validation services.
- `ApiGatewayPatterns.test.ts` — mapper, decorators, observer.

## Running

```bash
bun test ./src/layers/api-gateway/
```

or a single suite:

```bash
bun test ./src/layers/api-gateway/__tests__/ApiGatewayEventProcessor.test.ts
```

## Conventions

- No live HTTP or Redis: adapter behaviour is exercised through
  `ApiGatewayInMemoryAdapter`; `HttpApiGatewayAdapter`/
  `RedisApiGatewayAdapter` are covered by their constructor/config
  paths, not endpoints.
- Events are built as literals in the test body; no shared fixtures.
