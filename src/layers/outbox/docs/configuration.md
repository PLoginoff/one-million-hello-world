# Configuration: Outbox Layer

## `OutboxConfiguration`

Extends the base layer config with outbox-specific fields
(`types/outbox-types.ts`):

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable/disable the layer |
| `timeout` | `number` | `30000` | Operation timeout in ms |
| `retries` | `number` | `3` | Retry attempts |
| `logLevel` | `'debug' \| 'info' \| 'warn' \| 'error'` | `'info'` | Logging verbosity |
| `strategy` | `string` | `'default'` | Strategy name for the factory |
| `options` | `Record<string, unknown>` | `{}` | Free-form strategy options |
| `maxBatchSize` | `number` | — | Max messages per relay batch |
| `pollIntervalMs` | `number` | — | Delay between relay polls |
| `retentionDays` | `number` | — | How long archived messages are kept |
| `enableMetrics` | `boolean` | `true` | Expose Prometheus metrics |
| `enableHealthCheck` | `boolean` | `true` | Expose health check |

Defaults: `DEFAULT_OUTBOX_CONFIG` in
`configuration/defaults/OutboxDefaults.ts`. Build via
`OutboxConfigurationBuilder` / `OutboxBuilder`; validate via
`OutboxConfigurationValidator` / `OutboxValidator` (invalid input raises
`InvalidConfigurationError`).

## Message-Level Settings

Each `OutboxMessage` carries `maxRetries` — set per message at
`saveMessage` time so hot paths can have stricter retry budgets than
bulk events.

## Strategy Selection

`OutboxStrategyFactory.create(name)` accepts `default`, `fast`,
`reliable`, `cached`, `batch`.
