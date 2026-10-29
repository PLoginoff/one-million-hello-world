# ADR: Audit Layer

## Status

Accepted

## ADR-1: A rich typed audit-event vocabulary

**Context.** Compliance needs distinguishable, queryable event kinds:
access grants, resource changes, role/policy changes, data exports,
security incidents, session and credential lifecycle.

**Decision.** `AuditEventType` enumerates 28 kinds with a dedicated
payload interface per kind (`AccessGrantedPayload`,
`ResourceChangedPayload`, `SecurityEventPayload`,
`ComplianceCheckPayload`, `ApiKeyPayload`, …) and
`AuditEventPayload` as their union.

**Consequences.** Downstream sinks can index/filter by type; adding a
kind is an enum member + payload interface. The processor switches on
the enum.

## ADR-2: Multiple egress adapters with compliance semantics

**Context.** Audit data must reach files, SIEMs, HTTP collectors and
Redis depending on deployment, and stay testable offline.

**Decision.** Four `IAudit` adapters: `FileAuditAdapter` (file buffer),
`HttpAuditAdapter` (batched HTTP with retries to SIEM/Splunk/Elastic),
`RedisAuditAdapter` (Redis Streams + aggregations) and
`SiemAuditAdapter` (severity-tagged SIEM sink).

**Consequences.** The processor broadcasts to every registered adapter;
production picks HTTP/SIEM/Redis while tests use `FileAuditAdapter`'s
in-memory buffer. Each adapter maps the same event shape onto its own
transport.

## ADR-3: Feature-flagged tracking categories

**Context.** Not every deployment wants every audit category — PII and
sensitive resources differ per organization.

**Decision.** `AuditProcessorConfig` exposes a boolean per tracking
category (access, resource, security, compliance, session, credential)
plus `piiFields` and `sensitiveResources` lists, `allowedEventTypes`
whitelist and `maxEventSize` guard.

**Consequences.** The same processor serves minimal and maximal audit
deployments; PII is stripped during enrichment rather than at the sink.

## ADR-4: Standard strategy/domain scaffolding retained

**Context.** The layer plugs into the uniform machinery.

**Decision.** Keep the five generic strategies, DDD domain module,
config builder/validators, metrics collector, Prometheus exporter and
health check alongside the real processor and adapters.

**Consequences.** Uniform test layout and ops wiring; domain module is
scaffolding for richer retention/aggregation rules later.
