# Audit Layer Architecture

## Responsibility

Audit logging and compliance tracking. Layer 32. The layer takes an
`AuditContext` (`input`, `metadata`, `timestamp`) and returns
`AuditResult<T>`.

## Public contract

`interfaces/IAudit.ts` — `execute`, `configure`, `getStatus`.
`implementations/Audit.ts` is the reference implementation, wrapping
errors as `AUDIT_EXECUTION_ERROR`.

## Event processing

`domain/handlers/AuditEventProcessor.ts` is the substantive business
logic. `AuditEventType` (`domain/events/AuditEventTypes.ts`) defines 28
event kinds across access control (`ACCESS_GRANTED/DENIED`), resource
lifecycle (`RESOURCE_CREATED/UPDATED/DELETED/ACCESSED`), permission and
role changes, policy changes, data transfer
(`DATA_EXPORTED/IMPORTED`), `CONFIG_CHANGED`, `SECURITY_EVENT`,
`COMPLIANCE_CHECK`, sessions (`SESSION_STARTED/ENDED`,
`LOGIN_SUCCESS/FAILED`, `LOGOUT`), credentials (`PASSWORD_CHANGED`,
`MFA_ENABLED/DISABLED`) and API keys
(`API_KEY_CREATED/REVOKED`).

`AuditProcessorConfig` toggles each concern: `enableValidation`,
`enableEnrichment`, `enableAccessTracking`, `enableResourceTracking`,
`enableSecurityTracking`, `enableComplianceTracking`,
`enableSessionTracking`, `enableCredentialTracking`, plus
`maxEventSize`, `allowedEventTypes`, `piiFields` and
`sensitiveResources`. Processed events are routed to every registered
adapter.

## Adapters

Four `IAudit` implementations (`adapters/`):

| Adapter | Constructor | Purpose |
|---------|-------------|---------|
| `FileAuditAdapter`      | `(filePath = '/var/log/audit.log')`            | Append to a file-backed buffer (in-memory for tests) |
| `HttpAuditAdapter`      | `(config: HttpAuditAdapterConfig)`             | POST events to HTTP endpoints (SIEM, Splunk, Elastic) with batching/retries |
| `RedisAuditAdapter`     | `(config: RedisAuditAdapterConfig)`            | Persist to Redis Streams; aggregations in hashes/sorted sets |
| `SiemAuditAdapter`      | `(siemUrl, apiKey)`                            | SIEM-specific sink with severity tagging |

## Strategies & domain

Standard skeleton: five strategies (`default`, `fast`, `reliable`,
`cached`, `batch` via `AuditStrategyFactory`); `domain/` contains
entities (`AuditEntity`, `AuditExecution`, `AuditConfigState`,
`AuditMetricsSnapshot`), value objects (`AuditPriority`,
`AuditThreshold`, `AuditTimeWindow`), services (domain/execution/query/
validation), handlers, specifications, policies, in-memory repository,
pipeline, decorators, mapper, observer.

## Configuration & observability

`DEFAULT_AUDIT_CONFIG` (`enabled`, `timeout`, `retries`, `logLevel`),
fluent `AuditConfigurationBuilder`, validators,
`AuditMetricsCollector`, `AuditPrometheusMetricsCollector`,
`AuditHealthCheck` (`healthy | degraded | unhealthy`).
