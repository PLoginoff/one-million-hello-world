# ADR: Strategy Layer

## Status
Accepted

## Context
Operations need to run under selectable execution semantics (default /
experimental / conservative) with A/B testing and feature-flag gating,
without changing the operations themselves.

## Decisions

### 1. Operation-passing API
`StrategyManager.execute(operation, strategy?)` takes the work as a
closure and returns `StrategyResult<T>` (`success`, `data?`,
`strategy`, `flags`). The caller's operation is strategy-agnostic; the
manager annotates the result with which strategy ran and which flags
were enabled.

### 2. Three named strategy types
`StrategyType` = `DEFAULT | EXPERIMENTAL | CONSERVATIVE`. Selection is
explicit per call or falls back to `config.defaultStrategy`.

### 3. Percentage-based feature flags
`FeatureFlag` = `{ name, enabled, percentage }`. `isFlagEnabled` rolls
`Math.random() * 100` against `percentage` only when flags are globally
enabled (`config.enableFeatureFlags`) and the flag itself is `enabled` —
two-level gating.

### 4. Failures are captured in the result
`execute` catches operation errors and returns `success: false` with
the selected strategy + flags still attached, so A/B analysis sees
failures attributed to the strategy that ran them.

## Consequences
- Strategies/flags are toggled by config, not code changes.
- Percentage rollout is non-deterministic per call — fine for flags,
  intentionally so.
