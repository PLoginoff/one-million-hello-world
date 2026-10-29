# ADR: Transport Layer

## Status
Accepted

## Context
The final hop needs to emit HTTP-shaped responses with optional
streaming and chunked transfer encoding behind one send API.

## Decisions

### 1. Single `send(data, status)` contract
`Transport.send` returns `Promise<TransportResult>` (`success`,
`data`, `status`, `error`). Failures resolve with `success: false` /
`status: 500` rather than rejecting, so callers get a uniform
`TransportResult` either way.

### 2. Chunked encoding as a config toggle
`TransportConfig.enableChunkedEncoding` splits the payload into 1 KiB
chunks joined by `\r\n` inside `send` — applied transparently before
the result, no separate API.

### 3. Streaming is opt-in
`enableStreaming` defaults off; the flag exists on `TransportConfig`
so hosts choose buffered vs. streamed delivery without changing the
interface.

### 4. Generic strategies + domain package alongside
The layer also carries the shared scaffold — five `ITransport`
strategies (`Default/Fast/Reliable/Cached/Batch` via
`TransportStrategyFactory`), `domain/` (entities, value objects,
services, repository, specifications, policies, pipeline, decorators,
handlers, `TransportExecuted`/`TransportFailed`), adapters
(`InMemory`/`Mock`/`Stub`), health/metrics/errors.

## Consequences
- Response shaping is config-driven, keeping `ITransport` stable.
- Chunked encoding here is a string-level simulation; a real socket
  transport would stream the same chunks.
