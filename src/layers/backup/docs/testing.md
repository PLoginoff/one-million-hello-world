# Testing: Backup Layer

## Test files

Top-level (`__tests__/`):

- `Backup.test.ts` — `execute`/`configure`/`getStatus` contract and
  error wrapping.
- `BackupStrategies.test.ts` — the five strategies' `execute`,
  `canHandle` and `priority`; `BackupStrategyFactory` creation and
  unknown-name rejection.
- `BackupConfiguration.test.ts` — defaults, builder chaining and
  validator bounds.

Domain (`domain/__tests__/`):

- `BackupDomain.test.ts` — entities, value objects, domain service.
- `BackupExtendedDomain.test.ts` — specifications, policies, repository,
  pipeline.
- `BackupServices.test.ts` — execution/query/validation services.
- `BackupPatterns.test.ts` — mapper, decorators, observer.

## Running

From the repository root:

```bash
bun test ./src/layers/backup/
```

or a single suite:

```bash
bun test ./src/layers/backup/__tests__/BackupStrategies.test.ts
```

## Conventions

- Adapters used in tests are `BackupInMemoryAdapter`,
  `BackupMockAdapter`, `BackupStubAdapter` — no network or external
  service.
- Entities and value objects are built inside the test body; there are
  no shared fixture files.
