# ADR: Authorization Layer

## Status

Accepted

## ADR-1: Typed event vocabulary for the authz lifecycle

**Context.** Authorization produces distinct event kinds — permission
checks, role/policy CRUD, resource-access decisions, delegation,
condition evaluation, decision-cache hits.

**Decision.** `AuthorizationEventType` enumerates these kinds with a
typed payload each (`PermissionCheckPayload`,
`ResourceAccessPayload`, `DelegationPayload`,
`ConditionEvaluatedPayload`, `CacheEventPayload`, …), unioned as
`AuthorizationEventPayload`.

**Consequences.** Handlers and sinks can filter by decision-relevant
events (denials, cache misses) rather than free-form logs. Adding a
kind is an enum member + payload interface.

## ADR-2: PDP integration through adapters, not a built-in engine

**Context.** The layer records and enforces decisions but does not
itself implement a policy engine like OPA/Casbin.

**Decision.** `HttpAuthorizationAdapter` ships decisions/events to an
external PDP (OPA, Casbin, custom) over batched HTTP with retries;
`RedisAuthorizationAdapter` persists events and decision metrics to
Redis. `InMemory`/`Mock`/`Stub` cover tests.

**Consequences.** Policy evaluation stays in the dedicated engine; this
layer is the enforcement/telemetry seam. Swapping PDPs is an adapter
change.

## ADR-3: Decision-cache events are first-class

**Context.** Authz latency is dominated by policy evaluation; caching
decisions is common and its hit/miss behaviour is an operational
signal.

**Decision.** `CACHE_HIT`/`CACHE_MISS`/`CACHE_INVALIDATED` are explicit
event types, and `enableCacheTracking` is a separate processor toggle.

**Consequences.** Decision-cache effectiveness is measurable from the
event stream without external instrumentation.

## ADR-4: Feature-flagged tracking categories

**Context.** Different deployments audit different authz aspects and
PII rules differ.

**Decision.** `AuthorizationProcessorConfig` toggles permission, role,
policy, resource, subject, delegation, condition and cache tracking
independently, plus `piiFields` and `allowedEventTypes`.

**Consequences.** One processor serves both verbose-audit and
minimal-telemetry deployments.
