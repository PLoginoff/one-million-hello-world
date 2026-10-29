# Configuration: Onboarding Layer

## Configuration Shape

`OnboardingConfig` (in `types/`):

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable/disable the layer |
| `timeout` | `number` | `30000` | Operation timeout in ms |
| `retries` | `number` | `3` | Retry attempts |
| `logLevel` | `'debug' \| 'info' \| 'warn' \| 'error'` | `'info'` | Logging verbosity |

Defaults: `configuration/defaults/OnboardingDefaults.ts`.

## Building a Configuration

Use `OnboardingConfigurationBuilder` (and `OnboardingBuilder` where present)
from `configuration/builders/` to assemble a config object; validate via
`OnboardingConfigurationValidator` before applying.

```ts
const config = new OnboardingConfigurationBuilder()
  .withTimeout(5000)
  .withRetries(5)
  .build();
```

## Runtime Configuration

`Onboarding.configure(config)` merges a partial config at runtime;
`getStatus()` returns the active config plus internal metrics.

## Strategy Selection

Strategy is chosen via `OnboardingStrategyFactory.create(name)` where
`name` is `default`, `fast`, `reliable`, `cached` or `batch` —
it is not part of `OnboardingConfig`.
