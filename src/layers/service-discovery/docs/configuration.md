# Configuration: ServiceDiscovery Layer

## Registry tuning (`InMemoryRegistryConfig`)
| Option | Default | Description |
|--------|---------|-------------|
| `heartbeatTtlMs` | 30,000 | Silence before an instance is marked `unknown` |
| `evictAfterMissed` | 3 | Missed windows before an `unknown` instance is evicted |

`HeartbeatHealthChecker` consumes the same TTL/eviction parameters via
its `tick(now)` sweeps.

## Default Configuration
Defaults are defined in `configuration/defaults/ServiceDiscoveryDefaults.ts`
as `DEFAULT_SERVICEDISCOVERY_CONFIG`:

```typescript
export const DEFAULT_SERVICEDISCOVERY_CONFIG: ServiceDiscoveryConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
```

## Configuration Options
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| enabled | boolean | true | Enable/disable the layer |
| timeout | number | 30000 | Operation timeout in ms (validated 1,000–300,000) |
| retries | number | 3 | Retry attempts (validated 0–10) |
| logLevel | string | "info" | Logging verbosity (`debug`/`info`/`warn`/`error`) |
| strategy | string | "default" | Execution strategy: `default`, `fast`, `reliable`, `cached`, `batch` |

## Builder and Validator
- `ServiceDiscoveryConfigurationBuilder` (`configuration/builders/`) — fluent
  construction of the config object.
- `ServiceDiscoveryConfigurationValidator` (`configuration/validators/`) —
  returns `{ valid, errors, warnings }`; enforces the timeout/retries
  bounds and the strategy allowlist, warns on unknown `logLevel`.
