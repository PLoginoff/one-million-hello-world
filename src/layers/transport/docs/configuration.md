# Configuration: Transport Layer

## `TransportConfig` (`types/transport-types.ts`)
Passed to `Transport.setConfig` / returned by `getConfig`:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enableStreaming` | boolean | false | Emit data as a stream |
| `enableChunkedEncoding` | boolean | false | Split payloads into 1 KiB `\r\n`-joined chunks in `send` |

`setConfig` merges partial configs over the current values.

## Layer defaults
`configuration/defaults/TransportDefaults.ts` exports the generic
layer constants — `TransportDEFAULTS` (`enabled`, `timeout: 30000`,
`retries: 3`, `strategy: 'default'`, `maxConcurrentExecutions: 100`,
`cacheTtlMs: 60000`, metrics/health toggles), `TransportLIMITS`
(timeout 1–300 s, retries 0–10, max 1,000 concurrent, max TTL
3.6 M ms), and `TransportSTRATEGIES` (`'default'`, `'fast'`,
`'reliable'`, `'cached'`, `'batch'`).

## Builder and validator
- `TransportConfigurationBuilder` (`configuration/builders/`).
- `TransportConfigurationValidator` (`configuration/validators/`) —
  checks values against `TransportLIMITS` and `TransportSTRATEGIES`.
