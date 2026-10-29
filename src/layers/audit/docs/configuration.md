# Configuration: Audit Layer

## Defaults

`configuration/defaults/AuditDefaults.ts` exports
`DEFAULT_AUDIT_CONFIG`:

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

## Processor config (`AuditProcessorConfig`)

```ts
new AuditEventProcessor({
  enableValidation: true,
  enableEnrichment: true,
  enableAccessTracking: true,
  enableResourceTracking: true,
  enableSecurityTracking: true,
  enableComplianceTracking: true,
  enableSessionTracking: true,
  enableCredentialTracking: true,
  maxEventSize: 64_000,
  allowedEventTypes: [/* AuditEventType subset */],
  piiFields: ['email', 'ssn'],
  sensitiveResources: ['payment-cards'],
});
```

## Adapters

- `FileAuditAdapter(filePath)` — default `/var/log/audit.log`.
- `HttpAuditAdapter(config)` — `HttpAuditAdapterConfig`: endpoint URL,
  batch size, retry policy, headers.
- `RedisAuditAdapter(config)` — `RedisAuditAdapterConfig`: connection,
  stream key, metrics key prefix.
- `SiemAuditAdapter(siemUrl, apiKey)` — default
  `http://siem.local:8080`.

## Building & validating

`AuditConfigurationBuilder` — `withEnabled`, `withTimeout`,
`withRetries`, `withLogLevel`, `withStrategy`, `withOption(s)`,
`build`. `AuditConfigurationValidator`/`AuditValidator` check bounds;
`configure(config)` merges at runtime.
