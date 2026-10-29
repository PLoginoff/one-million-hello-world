# ADR: API Gateway Layer

## Status

Accepted

## ADR-1: Typed event vocabulary for the gateway lifecycle

**Context.** A gateway emits many semantically different events —
routing, auth failures, rate limiting, circuit-breaker state changes,
TLS expiry. A generic `Analytics`-style event would lose the type
safety.

**Decision.** `ApiGatewayEventType` enumerates 15 event kinds
(`request_received` … `custom_event`), each with a dedicated payload
interface (`RequestRoutedPayload`, `RateLimitExceededPayload`,
`CircuitBreakerPayload`, …). `ApiGatewayEventPayload` is the union.

**Consequences.** Handlers and adapters are typed per event; adding an
event kind means adding a payload interface and enum member. The
processor routes by enum value.

## ADR-2: Adapters as egress sinks, not gateways themselves

**Context.** The layer needs to ship gateway events to observability
backends (HTTP collectors, Redis) and to be testable without them.

**Decision.** Adapters implement the same `IApiGateway`-style contract:
`InMemory`/`Mock`/`Stub` for tests; `HttpApiGatewayAdapter` batches and
retries HTTP delivery (Datadog, New Relic, custom endpoints);
`RedisApiGatewayAdapter` writes to Redis Streams with metrics in
hashes/sorted sets.

**Consequences.** The event processor broadcasts to all registered
adapters; production wiring picks HTTP/Redis while tests use in-memory.
Adapters are egress sinks — actual proxying/routing lives in whatever
calls the layer.

## ADR-3: Strategy variants for execution profile

**Context.** Callers trade latency vs reliability vs throughput.

**Decision.** Five `IApiGatewayStrategy` implementations
(`default`/`fast`/`reliable`/`cached`/`batch`) with `priority` and
`canHandle`, created by `ApiGatewayStrategyFactory`.

**Consequences.** Strategy selection is a config string; new strategies
are additive. The strategies are execution profiles around the same
processing, not different gateways.

## ADR-4: Standard domain scaffolding retained

**Context.** The layer must match the repository's uniform layer shape
for tooling and tests.

**Decision.** Keep the generated DDD skeleton (entities, value objects,
services, specifications, policies, repository, pipeline, decorators)
alongside the real event processor and adapters.

**Consequences.** Uniform test layout and health/metrics wiring; the
domain module is scaffolding for richer routing/policy logic later.
