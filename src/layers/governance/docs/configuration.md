# Configuration: Governance Layer

## Defaults
`DEFAULT_GOVERNANCE_CONFIG` (`configuration/defaults/`):

```ts
{ enabled: true, timeout: 30000, retries: 3, logLevel: 'info' }
```

`configure(config: Record<string, unknown>)` shallow-merges keys. `GovernanceConfigurationBuilder` and `GovernanceConfigurationValidator` provide typed construction/validation.

## Strategy configuration
Strategies take `Record<string, unknown>` in their constructors and are created via `GovernanceStrategyFactory` (no `GovernanceFactory` exists). `fast` for per-request checks, `batch` for compliance sweeps.

## Status inspection
`getStatus()` returns current config and state for health checks.
