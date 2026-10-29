# Testing: Strategy Layer

## Test Files

| File | Scope |
|------|-------|
| `__tests__/StrategyManager.test.ts` | `StrategyManager`: `getConfig`/`setConfig`, `execute` (result envelope, strategy attribution), `registerFlag`, `isFlagEnabled` (global + per-flag gating) |
| `__tests__/StrategyStrategies.test.ts` | Generic strategies + `StrategyStrategyFactory` |
| `__tests__/StrategyConfiguration.test.ts` | `StrategyConfigurationBuilder`, `StrategyConfigurationValidator` |
| `domain/__tests__/StrategyPatterns.test.ts` | Domain-layer patterns (policies, specifications, decorators, handlers) |

## Running Tests

```bash
bun test ./src/layers/strategy/
```

Single file:

```bash
bun test ./src/layers/strategy/__tests__/StrategyManager.test.ts
```

Tests use `bun:test`. `isFlagEnabled` uses `Math.random` for rollout —
tests exercise the deterministic gates (`enableFeatureFlags`,
`flag.enabled`, `percentage` = 0/100) rather than the random branch.
