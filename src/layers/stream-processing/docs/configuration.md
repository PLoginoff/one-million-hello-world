# Configuration: StreamProcessing Layer

## Default Configuration
Defaults are defined in `configuration/defaults/StreamProcessingDefaults.ts`
as `DEFAULT_STREAMPROCESSING_CONFIG`:

```typescript
export const DEFAULT_STREAMPROCESSING_CONFIG: StreamProcessingConfig = {
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
- `StreamProcessingConfigurationBuilder` (`configuration/builders/`) — fluent
  construction of the config object.
- `StreamProcessingConfigurationValidator` (`configuration/validators/`) —
  returns `{ valid, errors, warnings }`; enforces the timeout/retries
  bounds and the strategy allowlist, warns on unknown `logLevel`.
