# Configuration: Authorization Layer

## Defaults

`configuration/defaults/AuthorizationDefaults.ts` exports
`DEFAULT_AUTHORIZATION_CONFIG`:

```json
{
  "enabled": true,
  "timeout": 30000,
  "retries": 3,
  "logLevel": "info"
}
```

## Options

| Option     | Type    | Default  | Description |
|------------|---------|----------|-------------|
| `enabled`  | boolean | `true`   | Enable/disable the layer |
| `timeout`  | number  | `30000`  | Operation timeout in ms |
| `retries`  | number  | `3`      | Retry attempts |
| `logLevel` | string  | `"info"` | `debug \| info \| warn \| error` |

## Processor config (`AuthorizationProcessorConfig`)

Toggles: `enableValidation`, `enableEnrichment`,
`enablePermissionTracking`, `enableRoleTracking`,
`enablePolicyTracking`, `enableResourceTracking`,
`enableSubjectTracking`, `enableDelegationTracking`,
`enableConditionTracking`, `enableCacheTracking`; guards:
`maxEventSize`, `allowedEventTypes` (`AuthorizationEventType[]`),
`piiFields`.

## Adapters

- `HttpAuthorizationAdapter(config)` —
  `HttpAuthorizationAdapterConfig`: PDP endpoint (OPA, Casbin, custom),
  batch size, retry policy, headers.
- `RedisAuthorizationAdapter(config)` —
  `RedisAuthorizationAdapterConfig`: connection, stream key, metrics
  key prefix.

## Building & validating

`AuthorizationConfigurationBuilder` — `withEnabled`, `withTimeout`,
`withRetries`, `withLogLevel`, `withStrategy`, `withOption(s)`,
`build`. `AuthorizationConfigurationValidator`/`AuthorizationValidator`
check bounds; `configure(config)` merges at runtime.
