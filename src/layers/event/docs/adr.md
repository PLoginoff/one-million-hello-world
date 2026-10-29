# ADR: Event Layer

## Status
Accepted (Refactored)

## Context
Event-driven communication (pub/sub, domain events, handler pipelines) needed a home that could grow beyond a simple emitter — subscription lifecycle, error handling, persistence, monitoring, and multiple broker backends.

## Decisions

### 1. Eight-layer clean architecture
Domain (entities/VOs) → Core (bus, subscription mgmt, execution, errors) → Infrastructure (stores, queues, external publishers) → Application (dispatcher, handler registry) → Utils → Monitoring → Configuration → Testing. Each ring only depends inward.

*Rationale:* a flat emitter couldn't host persistence/monitoring cleanly; layering makes each concern replaceable (e.g. `MemoryEventStore` → Redis/Kafka without touching the bus).

### 2. `IEventBus` + `SubscriptionManager` split
Publishing/subscribing lives in `core/implementations/EventBus.ts`; subscription storage/lifecycle lives in `SubscriptionManager`; execution in `EventExecutor`; failures in `ErrorHandler`. One responsibility per component, all behind `core/interfaces/`.

### 3. Strategy-pattern event dispatch
`Default`, `Broadcast`, `Filtered`, `Prioritized`, `Logging`, `Metrics`, `DeadLetter` strategies implement `IEventStrategy` — dispatch semantics (fan-out vs filtered vs dead-lettered) are pluggable per event, not hard-coded in the bus.

### 4. Multiple broker adapters
`InMemoryEventBusAdapter`, `RedisEventBusAdapter`, `RedisEventAdapter`, `KafkaEventAdapter`, `HttpEventAdapter` — the same bus API fronts in-process, Redis, Kafka, and HTTP transports.

### 5. First-class monitoring and config
`EventMetricsCollector`/`EventLogger` (monitoring/) and `EventBusConfig`/`ConfigLoader`/`ConfigValidator` (configuration/) are real subsystems, not afterthoughts — observability and validation are built into the bus surface.

### 6. Immutable domain events
`Event`/`EventId`/`EventType`/`EventMetadata`/`EventPayload` are immutable VOs/entities in `domain/` — events are facts, not mutable messages.

## Consequences
- Replaceable transports, dispatch semantics, and stores
- More moving parts than a simple emitter — justified by the pub/sub + persistence + monitoring requirements
