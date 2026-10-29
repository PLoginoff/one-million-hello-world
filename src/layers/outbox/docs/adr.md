# ADR: Outbox Layer

## Status
Accepted

## Context
Publishing events directly from inside a transaction loses messages when
the broker is unavailable; writing to an outbox table in the same
transaction and relaying asynchronously is the standard fix.

## Decisions

### 1. Explicit message state machine
`OutboxMessageStatus` (`pending → processing → processed | failed →
archived`) makes delivery state observable. `getMessages({status})` lets a
relay poll only `pending`, and `archiveMessage` supports retention.

### 2. Persistence behind `IOutboxAdapter`
The adapter interface (`saveMessage`, `markProcessed`, `markFailed`,
`archiveMessage`, `getStats`, `clear`) hides the storage technology. Only
in-memory, mock and stub adapters ship — a SQL adapter plugs in without
touching the relay logic.

### 3. Retry with `maxRetries`, terminal `failed` state
Each message carries `retryCount`/`maxRetries`; on exhaustion the status
becomes `failed` rather than unbounded retry. `MaxRetriesExceededError`
and `MessageAlreadyProcessedError` are typed so relays can branch on
them.

### 4. Lifecycle events for observability
`OutboxEventType` emits an event per transition plus `batch_processed`
and `config_changed`, so monitoring hooks into real transitions instead
of scraping logs.

### 5. Strategy-selected processing
`IOutboxStrategy` receives an `OutboxStrategyContext` (`operation`,
`message`, `batchSize`, `config`), letting `batch` vs `reliable` vs
`fast` differ in batching and retry posture behind the factory.

## Consequences
- Message durability and replay semantics are explicit and testable.
- No broker client ships; the relay publisher is left to the caller.
- In-memory adapter is for tests/dev — production needs a durable
  adapter.
