# Testing: EtlPipeline Layer

## Running tests

```bash
bun test ./src/layers/etl-pipeline/
```

## Test files

`__tests__/`:

| File | Covers |
|------|--------|
| `EtlPipeline.test.ts` | `execute()` success/failure, `configure()` merge, `getStatus()` + metrics |
| `EtlPipelineStrategies.test.ts` | Five strategies + `EtlPipelineStrategyFactory` |
| `EtlPipelineConfiguration.test.ts` | Config builder/validator, defaults |

`domain/__tests__/` — `EtlPipelineDomain`, `ExtendedDomain`, `Services`, `Patterns` cover entities, value objects, services, repository, events, handlers, decorators, observer, pipeline, policies, specifications.

## Conventions
- `createContext(input)` builds `EtlPipelineContext` fixtures; strategy tests are table-driven.
- In-memory connectors only — no external sources/sinks needed.
