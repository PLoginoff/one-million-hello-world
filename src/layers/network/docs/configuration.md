# Configuration: Network Layer

The layer's real configuration lives in `types/network-types.ts`. There is
no single `enabled/timeout` bag — configuration is split by concern.

## SocketConfig

Per-socket settings passed to `NetworkConnection`:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `host` | `string` | — | Remote host |
| `port` | `number` | — | Remote port |
| `timeout` | `number` | — | Socket timeout in ms |
| `keepAlive` | `boolean` | — | TCP keep-alive |
| `keepAliveInitialDelay` | `number` | — | Initial keep-alive delay |
| `noDelay` | `boolean` | — | Disable Nagle's algorithm |
| `allowHalfOpen` | `boolean` | — | Allow half-open sockets |
| `pauseOnClose` | `boolean` | — | Pause on close |

## ConnectionConfig

Wraps `SocketConfig` with retry/compression/encryption:

| Option | Type | Description |
|--------|------|-------------|
| `socket` | `SocketConfig` | Underlying socket settings |
| `maxRetries` | `number` | Reconnect attempts |
| `retryDelay` | `number` | Base retry delay (ms) |
| `backoffMultiplier` | `number` | Exponential-backoff factor |
| `priority` | `ConnectionPriority` | Connection priority |
| `type` | `ConnectionType` | Connection type |
| `enableCompression` / `compressionLevel` | `boolean` / `number` | Payload compression |
| `enableEncryption` / `encryptionKey` | `boolean` / `string` | Payload encryption |

## TLSConfig

`cert`, `key`, `ca`, `rejectUnauthorized`, `minVersion`, `maxVersion`.

## ConnectionPoolConfig

| Option | Type | Description |
|--------|------|-------------|
| `minConnections` / `maxConnections` | `number` | Pool bounds |
| `acquireTimeout` | `number` | Wait for a free connection |
| `idleTimeout` | `number` | Evict idle connections |
| `maxLifetime` | `number` | Recycle old connections |

Used by `strategies/connection/ConnectionPoolStrategy.ts`.

## SecurityConfig

`enableIPWhitelist`/`ipWhitelist`, `enableIPBlacklist`/`ipBlacklist`,
`enableRateLimit`/`rateLimitMax`/`rateLimitWindow`, `enableTLS`/`tlsConfig`.

## Other

- `BandwidthConfig` — bandwidth shaping (see `BandwidthLimit` value object).
- `MonitoringConfig` — metrics/monitoring toggles.

## Builders and validation

`configuration/builders/NetworkConfigBuilder.ts` /
`NetworkConfigurationBuilder.ts` assemble these objects;
`configuration/validators/NetworkConfigValidator.ts` /
`NetworkConfigurationValidator.ts` check them.
`configuration/defaults/DefaultConfigs.ts` + `NetworkDefaults.ts` hold
defaults.
