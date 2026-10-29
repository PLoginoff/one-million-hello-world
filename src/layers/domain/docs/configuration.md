# Configuration: Domain Layer

## Layer defaults
`DEFAULT_DOMAIN_CONFIG` (`configuration/defaults/`):

```ts
{ enabled: true, timeout: 30000, retries: 3, logLevel: 'info' }
```

`configure()` merges `Record<string, unknown>`; `DomainConfigurationBuilder` and validators provide typed construction.

## Domain-specific behavior
Domain semantics live in code, not config:

- **Entity validation** — `DomainManager.validateEntity()` checks required fields and timestamps before create/update; not toggleable.
- **Value objects** — immutable by construction; `MessageContent.create(...)`, `CorrelationId`, `RequestId`, `Timestamp`.
- **Message policy** — `services/MessagePolicy.ts` holds HelloWorld-message business rules; `HelloWorldFactory`/`DomainFactory` construct valid instances.

## Status inspection
`getStatus()` returns current config and state.
