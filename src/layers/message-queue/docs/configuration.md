# Configuration: MessageQueue Layer

## QueueConfig (runtime queue behavior)

`QueueConfig` in `types/message-queue-types.ts` controls the queue itself —
this is what `MessageQueue` applies:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxRetries` | `number` | `3` | Max attempts per message before dead-lettering |
| `retryDelay` | `number` | `1000` | Delay (ms) between attempts |
| `enableDeadLetter` | `boolean` | `true` | Move exhausted messages to the DLQ |
| `maxQueueSize` | `number` | `1000` | Reject `enqueue` when the queue is full |

## MessageQueueConfiguration (layer config)

`MessageQueueConfiguration` extends the shared layer shape:

| Option | Type | Description |
|--------|------|-------------|
| `enabled` | `boolean` | Enable/disable the layer |
| `timeout` | `number` | Operation timeout in ms |
| `retries` | `number` | Retry attempts |
| `logLevel` | `'debug' \| 'info' \| 'warn' \| 'error'` | Logging verbosity |
| `strategy` | `string` | Strategy name for `MessageQueueStrategyFactory` |
| `options` | `Record<string, unknown>` | Free-form strategy options |

Defaults: `configuration/defaults/MessageQueueDefaults.ts`; build via
`configuration/builders/MessageQueueConfigurationBuilder`; validate via
`configuration/validators/MessageQueueConfigurationValidator`.

## Runtime Reconfiguration

`MessageQueue` exposes `updateConfig`/`configure` for partial updates;
changes apply to subsequent enqueue/dequeue cycles.
