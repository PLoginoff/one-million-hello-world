# Testing: Security Layer

## Test Files

| File | Scope |
|------|-------|
| `__tests__/SecurityManager.test.ts` | `SecurityManager` core: auth, policy, context |
| `__tests__/SecurityManager.advanced.test.ts` | Extended paths: threat detection, extended contexts |
| `__tests__/SecurityManager.edge-cases.test.ts` | Boundary and failure paths |
| `__tests__/SecurityManager.integration.test.ts` | End-to-end security flows |
| `__tests__/SecurityStrategies.test.ts` | Strategy implementations |
| `__tests__/SecurityLoggingStrategy.test.ts` | `LoggingSecurityStrategy` |
| `__tests__/SecurityMetricsStrategy.test.ts` | `MetricsSecurityStrategy` |
| `__tests__/SecurityRedisAdapter.test.ts` | `RedisAdapter` |
| `__tests__/SecurityConfiguration.test.ts` | Config builders and validators |
| `__tests__/SecurityErrorMapper.test.ts` | `SecurityErrorMapper` |
| `__tests__/SecurityErrors.test.ts` | `SecurityError` shapes |
| `__tests__/SecurityHealthCheck.test.ts` | `SecurityHealthCheck` |
| `__tests__/SecurityMetricsCollector.test.ts` | `SecurityMetricsCollector` |
| `__tests__/SecurityTypes.test.ts` | Type-level shapes |
| `domain/__tests__/` | `SecurityExtendedDomain`, `SecurityPatterns` — entities, value objects, policies, specifications, pipeline, decorators, handlers |

## Running Tests

```bash
bun test ./src/layers/security/
```

Single file:

```bash
bun test ./src/layers/security/__tests__/SecurityManager.test.ts
```

Tests use `bun:test` (`describe`/`it`/`expect`). The `RedisAdapter` test
runs against the in-process mock — no live Redis required.
