# Testing Strategy

## Overview
Network Layer tests cover `NetworkConnection`/`NetworkManager`, the connection pool, advanced features (compression, encryption), security (IP filter, rate limit), and health/diagnostics. Tests use `bun:test` in `src/layers/network/__tests__/`.

## Coverage Targets

- Minimum 95%, target 99%+; branch 90%+, functions 100%.
- `NetworkConnection`/`NetworkManager`: 99%; strategies, config, types: 95%+.

## Test Organization

```
src/layers/network/__tests__/
├── NetworkConnection.test.ts / .advanced / .edge-cases / .integration
├── NetworkManager.test.ts / .advanced / .edge-cases / .integration
├── NetworkStrategies.test.ts
├── NetworkTypes.test.ts
└── NetworkConfiguration.test.ts
```

## Unit Test Categories

### Connection State (`NetworkConnection`)
`connect()` transitions `DISCONNECTED → CONNECTING → CONNECTED`/`ERROR`; `pause`/`resume` emit state-change logs. Assert via `connection.getState()` and emitted events.

### Identification
Each connection gets a unique `id` and `createdAt`/`lastActivity` timestamps; `send`/`receive` update `lastActivity`.

### Advanced Features
- **Compression**: `config.compression.enabled` → `send` compresses, `receive` decompresses round-trip; `level` trades CPU for size.
- **Encryption**: `config.encryption.enabled` + `algorithm`/`key` → encrypt/decrypt round-trip; `keyRotationInterval` swaps keys mid-stream.

### Connection Pool (`NetworkManager`)
`acquire`/`release` honor `maxConnections`; idle connections are reused; `idleTimeout`/`cleanupInterval` prune stale ones.

### Security
- **IP filter**: `blacklist`/`whitelist`/`enabled` + CIDR ranges gate `connect`/`accept`.
- **Rate limit**: `maxRequests`/`windowMs` allow N per window; counters reset after `windowMs`.

## Integration Tests

- **Lifecycle**: `acquire → connect → send/receive → release` end-to-end.
- **Pool stress**: `Promise.all` over >`maxConnections` acquisitions queues/releases correctly.
- **Error recovery**: `autoReconnect` + `maxRetries` re-establishes after a dropped connection.

## Advanced Feature Tests

- `checkHealth()` on a connection returns pass/fail per its state.
- `manager.runDiagnostics()` runs all registered diagnostic steps and reports each result.

## Edge Cases

- Boundary: `maxBufferSize`, zero-byte and multi-MB payloads.
- Errors: `timeout`, invalid `maxConnections`, concurrent state transitions.

## Type Validation

`ConnectionState`/`ConnectionPriority` enums; `INetworkConnection` (`connect`, `close`, `send`, `receive`) and `INetworkManager` (`acquire`, `release`, `getStatistics`) interface compliance.

## Performance Tests

- Throughput: sustained `send`/`receive` meets target bytes/s.
- Latency: p50/p95 `send`→`receive` round-trip under threshold.

## Test Utilities

```typescript
class MockConnection implements INetworkConnection {
  async connect() {} async close() {}
  async send(d) {} async receive() {}
}
const createConfig = (o?) => ({ host: 'localhost', port: 8080, timeout: 5000, ...o });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const waitForState = async (conn, state, timeout = 5000) => { /* poll getState */ };
```

## Running Tests

```bash
bun test ./src/layers/network/
bun test ./src/layers/network/__tests__/NetworkConnection.test.ts
bun test --coverage ./src/layers/network/
```

## Best Practices

- Mock `INetworkConnection` for `NetworkManager` tests; use real sockets only in integration.
- Cover every `ConnectionState` transition incl. `ERROR` recovery paths.
- Assert timestamp/activity updates after each I/O op.
- Isolate pool tests by `maxConnections`/`idleTimeout` so timing isn't flaky.
