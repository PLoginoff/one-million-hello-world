# ADR: Inbox Layer

## Status
Accepted

## Decisions

### 1. Inbox pattern for exactly-once processing
Consumers check-and-record incoming messages through this layer: a message id is stored on first sight; redeliveries are detected as duplicates instead of reprocessed. This is the receiving-side counterpart to the `outbox` layer's sending-side pattern.

### 2. Dedup store behind a repository seam
`InboxInMemoryRepository` ships in-repo; durable stores (DB table, Redis) plug into the repository interface — dedup must survive process restarts to be meaningful.

### 3. Dedicated `errors/` module
`InboxErrors.ts` centralizes typed codes — "duplicate message" is a distinct, expected result worth its own error type, not a generic failure.

### 4. Retention via `TimeWindow`
Dedup entries shouldn't live forever — `InboxTimeWindow` models retention so expired entries can be pruned once message redelivery windows pass.

### 5. Batch dedup as a strategy
Consumer batches are the common case in queue processing — `batch` deduplicates a whole delivery in one pass rather than N individual checks.

### 6. Non-throwing results
`execute()` returns `{ success: false, error: { code: 'INBOX_EXECUTION_ERROR' } }` — duplicates and store failures are control flow in a consumer loop, not exceptions.
