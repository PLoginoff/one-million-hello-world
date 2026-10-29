# Testing: Audit Layer

## Test files

Top-level (`__tests__/`):

- `Audit.test.ts` — `execute`/`configure`/`getStatus` contract.
- `AuditAdapters.test.ts` — `FileAuditAdapter` and `SiemAuditAdapter`
  behaviour against `AuditContext` inputs.
- `AuditConfiguration.test.ts` — defaults, builder, validator.
- `AuditStrategies.test.ts` — five strategies and `AuditStrategyFactory`.
- `AuditEventProcessor.test.ts` — the audit processor: registers an
  in-memory sink and walks the `AuditEventType` vocabulary (access,
  resource, security, compliance, session, credential, API-key events)
  asserting validation, enrichment and routing.

Domain (`domain/__tests__/`):

- `AuditDomain.test.ts` — entities, value objects, domain service.
- `AuditExtendedDomain.test.ts` — specifications, policies, repository,
  pipeline.
- `AuditServices.test.ts` — execution/query/validation services.
- `AuditPatterns.test.ts` — mapper, decorators, observer.

## Running

```bash
bun test ./src/layers/audit/
```

or the adapters only:

```bash
bun test ./src/layers/audit/__tests__/AuditAdapters.test.ts
```

## Conventions

- `FileAuditAdapter` and `SiemAuditAdapter` buffer events in memory in
  tests — no real file writes or SIEM calls.
- `HttpAuditAdapter`/`RedisAuditAdapter` are exercised through their
  config/constructor paths, not live endpoints.
- Events are literals inside the test body; no fixture files.
