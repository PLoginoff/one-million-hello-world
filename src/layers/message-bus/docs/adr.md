# ADR: MessageBus Layer

## Status
Accepted

## Context
The pipeline needs a dedicated message-bus step that can be tuned per
deployment (throughput vs. reliability vs. batching) without changing call
sites.

## Decisions

### 1. Strategy pattern over a single implementation
Five strategies (`default`, `fast`, `reliable`, `cached`, `batch`) all
implement `IMessageBusStrategy`. Callers pick by name through
`MessageBusStrategyFactory` rather than constructing classes directly, so
new strategies can be added via `registerStrategy` without modifying the
factory.

### 2. CQRS-style domain handlers
`MessageBusCommandHandler`, `MessageBusQueryHandler`, and
`MessageBusEventHandler` separate write, read, and notification concerns.
This mirrors how the bus is used downstream: commands mutate, queries read,
events notify `MessageBusEventObserver` subscribers.

### 3. In-memory transport first
`InMemoryAdapter` is the primary adapter; `MockAdapter`/`StubAdapter` exist
for tests. No broker (Kafka/RabbitMQ) is wired in — the interface leaves
room for one, but the current scope is single-process.

### 4. Domain primitives as value objects
`MessageBusPriority`, `MessageBusThreshold`, and `MessageBusTimeWindow` are
immutable value objects so policy decisions (rate policy, access policy)
operate on typed concepts instead of raw numbers.

### 5. Cross-cutting concerns as decorators
Logging and caching are implemented as `MessageBusLoggingDecorator` /
`MessageBusCachingDecorator` wrappers rather than inside `MessageBus`
itself, keeping the core implementation free of side effects.

## Consequences
- Strategy selection is a configuration concern, not a code change.
- Test coverage is uniform: each strategy has the same `execute` contract.
- The in-memory implementation is deterministic, which simplifies tests.
- No ordering or delivery guarantees beyond what the chosen strategy
  implements.
