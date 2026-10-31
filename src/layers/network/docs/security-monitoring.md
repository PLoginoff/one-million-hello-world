# Security and Monitoring

## Security Configuration

### IP Filtering
`IPFilterConfig { whitelist, blacklist, enabled }` — checks blacklist first, then whitelist (when enabled). Supports IPv4, IPv6, CIDR ranges (`192.168.1.0/24`), and wildcards (`192.168.*`).

### Rate Limiting
`RateLimitConfig { enabled, windowMs, maxRequests, perIP, perConnection, burstLimit? }` — sliding-window limiting with optional burst allowance, tracked per-IP and/or per-connection. Results expose `allowed`, `remaining`, `resetTime`, `retryAfter`.

### TLS
`TLSConfig { enabled, key, cert, ca?, rejectUnauthorized, minVersion?, maxVersion?, cipherSuites? }` — protocol version pinning (`TLSv1.2`/`TLSv1.3`), cipher selection, CA validation.

### Security Events
`SecurityEvent { timestamp, type: SecurityEventType, source, details, severity }` — `IP_BLOCKED`, `RATE_LIMIT_EXCEEDED`, `TLS_NEGOTIATION_FAILED`, `AUTHENTICATION_FAILED`, `SUSPICIOUS_ACTIVITY`, `BRUTE_FORCE_DETECTED`. Logged, aggregated, and exportable for SIEM.

## Bandwidth Management

`BandwidthConfig { enabled, maxBytesPerSecond, perConnectionLimit?, algorithm: 'token-bucket' | 'leaky-bucket' }` — global + per-connection limits, fair sharing, burst allowance.

## Monitoring and Diagnostics

### Metrics and Health
`PerformanceMetrics`: `cpu.usage/trend`, `memory.used/total/usage`, `latency.min/max/avg/p50/p95/p99`, `io.read/write bytes+ops`. Health scoring: 90+ healthy, 70–89 degraded, <70 unhealthy; checks cover connection, pool, resource, network, and security health.

### Diagnostics
`runDiagnostics()` steps through connectivity, DNS, firewall, TLS, and bandwidth checks — each timed with `pass`/`fail`/`skip`.

### Alerting
`AlertThresholds` sets `warning`/`critical` per metric (cpu, memory, latency, errorRate); actions log, notify, or trigger recovery.

### Statistics
Per-connection `ConnectionStatistics` (bytes/packets, errors, reconnections, uptime, latency, throughput, packetLoss) aggregate into `NetworkStatistics`. `resetStatistics()`/`resetConnectionStatistics(id)`/`resetErrorCount()` clear counters.

## Event Handling

`NetworkEvent { type: NetworkEventType, timestamp, connectionId?, data? }` — `CONNECTION_CREATED/CONNECTED/CLOSED/ERROR`, `DATA_SENT/RECEIVED`, `STATE_CHANGED`, `HEALTH_CHECK_COMPLETED`, `SECURITY_EVENT`. Handlers implement `IEventHandler { handle, priority, filter? }`; `subscribe`/`unsubscribe`/`subscribeOnce`/`broadcast` on the manager.

## Error Handling

`NetworkError` codes: `CONNECTION_FAILED`, `CONNECTION_LOST`, `TIMEOUT`, `BUFFER_OVERFLOW`, `ENCRYPTION_ERROR`, `COMPRESSION_ERROR`, `INVALID_STATE`, `CONFIGURATION_ERROR`, `SECURITY_VIOLATION`, `RATE_LIMIT_EXCEEDED`. `ErrorTracking` keeps `totalErrors`, `errorsByType`, `lastError`, `errorHistory` per connection.

## Best Practices

- TLS in production; rate limiting + IP filtering for known threats; monitor security events.
- Tune alert thresholds to baseline; run diagnostics on schedule; track latency/packet-loss trends.
