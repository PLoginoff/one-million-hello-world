# Testing: Validation Layer

## Test Files

| File | Scope |
|------|-------|
| `__tests__/Validator.test.ts` | `Validator` core: schemas, rules, result envelope |
| `__tests__/Validator.advanced.test.ts` | Cross-field, conditional, async validation |
| `__tests__/Validator.edge-cases.test.ts` | Boundary/error paths |
| `__tests__/Validator.integration.test.ts` | End-to-end validation flows |
| `__tests__/ValidationStrategies.test.ts` | Strategy implementations + factory |
| `__tests__/ValidationConfiguration.test.ts` | Config builders and validators |
| `__tests__/ValidationErrorMapper.test.ts` | `ValidationErrorMapper` |
| `__tests__/ValidationHealthCheck.test.ts` | `ValidationHealthCheck` |
| `__tests__/ValidationMetricsCollector.test.ts` | `ValidationMetricsCollector` |
| `__tests__/ValidationTypes.test.ts` | Type-level shapes (`ValidationResult`, errors, warnings) |
| `domain/__tests__/` | `ValidationExtendedDomain`, `ValidationPatterns`, `ValidationServices` — entities, value objects, policies, specifications, pipeline, decorators, handlers, repository |

## Running Tests

```bash
bun test ./src/layers/validation/
```

Single file:

```bash
bun test ./src/layers/validation/__tests__/Validator.test.ts
```

Tests use `bun:test` (`describe`/`it`/`expect`). Schemas are plain data
and validators run in-process — no external validator service needed.
