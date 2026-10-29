# Testing: Configuration Layer

## Test files

Top-level (`__tests__/`):

- `Configuration.test.ts` — `execute`/`configure`/`getStatus` contract.
- `ConfigurationAdapters.test.ts` — `EnvConfigAdapter` (sets
  `process.env.APP_*` in `beforeEach`, asserts hit and
  `CONFIG_NOT_FOUND`) and `FileConfigAdapter` (seeded `values` map).
- `ConfigurationConfiguration.test.ts` — defaults, builder, validator.
- `ConfigurationStrategies.test.ts` — five strategies and
  `ConfigurationStrategyFactory`.

Domain (`domain/__tests__/`):

- `ConfigurationDomain.test.ts` — entities, value objects, domain
  service.
- `ConfigurationExtendedDomain.test.ts` — specifications, policies,
  repository, pipeline.
- `ConfigurationServices.test.ts` — execution/query/validation
  services.
- `ConfigurationPatterns.test.ts` — mapper, decorators, observer.

## Running

```bash
bun test ./src/layers/configuration/
```

or the adapters only:

```bash
bun test ./src/layers/configuration/__tests__/ConfigurationAdapters.test.ts
```

## Conventions

- `EnvConfigAdapter` tests write real `process.env` entries with a
  unique key (`TEST_CONFIG_KEY_12345`) and rely on the `APP` prefix;
  clean up after each test.
- `FileConfigAdapter` tests stay entirely in-memory — no file system.
