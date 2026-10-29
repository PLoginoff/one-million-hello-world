# Configuration: Strategy Layer

## `StrategyConfig` (`types/strategy-types.ts`)
Passed to `StrategyManager` / returned by `getConfig`:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `defaultStrategy` | `StrategyType` | `DEFAULT` | Strategy used when `execute` gets none |
| `enableABTesting` | boolean | false | Record strategy choice on results for A/B analysis |
| `enableFeatureFlags` | boolean | false | Master switch for `isFlagEnabled` |

`StrategyType`: `DEFAULT`, `EXPERIMENTAL`, `CONSERVATIVE`.
`FeatureFlag`: `{ name, enabled, percentage }`.

## Presets (`configuration/defaults/StrategyDefaults.ts`)
`StrategyDefaults` returns `StrategyConfigDefaults`
(`strategyConfig` + `enableMetrics`/`enableLogging`/`enableFeatureFlags`)
for: `getDefault`, `getHighPriority`, `getLowPriority`,
`getDevelopment` — built on the `StrategyConfig` domain value object.

## Builders and validators
- `StrategyConfigBuilder` / `StrategyConfigurationBuilder`
  (`configuration/builders/`).
- `StrategyConfigValidator` / `StrategyConfigurationValidator`
  (`configuration/validators/`).
