# Authorization Layer Architecture

## Responsibility

Authorization and policy enforcement. Layer 37. The layer takes an
`AuthorizationContext` (`input`, `metadata`, `timestamp`) and returns
`AuthorizationResult<T>`.

## Public contract

`interfaces/IAuthorization.ts` — `execute`, `configure`, `getStatus`.
`implementations/Authorization.ts` is the reference implementation,
wrapping errors as `AUTHORIZATION_EXECUTION_ERROR`.

## Event processing

`domain/handlers/AuthorizationEventProcessor.ts` processes the
authorization lifecycle defined in
`domain/events/AuthorizationEventTypes.ts`: permission checks and
results (`PERMISSION_CHECK/GRANTED/DENIED`), role CRUD and
assignment (`ROLE_CREATED/UPDATED/DELETED/ASSIGNED/REVOKED`), policy
lifecycle (`POLICY_EVALUATED/CREATED/UPDATED/DELETED`), resource access
(`RESOURCE_ACCESS_REQUESTED/GRANTED/DENIED`), subjects
(`SUBJECT_CREATED/UPDATED/DELETED`), delegation
(`DELEGATION_GRANTED/REVOKED`), condition evaluation, decision-cache
events (`CACHE_HIT/MISS/INVALIDATED`) and `CUSTOM_EVENT`.

`AuthorizationProcessorConfig` toggles each category
(`enablePermissionTracking`, `enableRoleTracking`,
`enablePolicyTracking`, `enableResourceTracking`,
`enableSubjectTracking`, `enableDelegationTracking`,
`enableConditionTracking`, `enableCacheTracking`) plus validation,
enrichment, `maxEventSize`, `allowedEventTypes` and `piiFields`.

## Adapters

`adapters/` ships two families:

- Contract-level (`IAuthorizationAdapter`):
  `AuthorizationInMemoryAdapter`, `AuthorizationMockAdapter`,
  `AuthorizationStubAdapter` — test sinks.
- Layer-level (`IAuthorization`):
  `HttpAuthorizationAdapter` — forwards decisions/events to external
  HTTP endpoints (OPA, Casbin, custom PDPs) with batching and retries;
  `RedisAuthorizationAdapter` — persists events to Redis Streams and
  decision metrics to hashes/sorted sets.

## Strategies & domain

Standard skeleton: five strategies (`default`, `fast`, `reliable`,
`cached`, `batch` via `AuthorizationStrategyFactory`); `domain/`
contains entities (`AuthorizationEntity`, `AuthorizationExecution`,
`AuthorizationConfigState`, `AuthorizationMetricsSnapshot`), value
objects (`AuthorizationPriority`, `AuthorizationThreshold`,
`AuthorizationTimeWindow`), services (domain/execution/query/
validation), handlers, specifications, policies, in-memory repository,
pipeline, decorators, mapper, observer.

## Configuration & observability

`DEFAULT_AUTHORIZATION_CONFIG` (`enabled`, `timeout`, `retries`,
`logLevel`), fluent `AuthorizationConfigurationBuilder`, validators,
`AuthorizationMetricsCollector`,
`AuthorizationPrometheusMetricsCollector`, `AuthorizationHealthCheck`
(`healthy | degraded | unhealthy`).
