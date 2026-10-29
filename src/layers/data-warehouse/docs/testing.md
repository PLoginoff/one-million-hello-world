# Testing: DataWarehouse Layer

## Running tests

```bash
bun test ./src/layers/data-warehouse/
```

(The leading `./` is required. Jest via `npx jest --testPathPattern=data-warehouse` also works — `jest.config.js` uses `ts-jest` — but `bun test` is the fast path.)

## Test files

`__tests__/`:

| File | Covers |
|------|--------|
| `DataWarehouse.test.ts` | `execute()` success/failure paths, `configure()` merge, `getStatus()` shape and metric counters |
| `DataWarehouseConfiguration.test.ts` | `DataWarehouseConfigurationBuilder`, `DataWarehouseConfigurationValidator`, defaults |
| `DataWarehouseStrategies.test.ts` | All five strategies: `name`, non-negative `priority`, `execute()` success, `getExecutionCount()` tracking; `DataWarehouseStrategyFactory.create()` |

`domain/__tests__/`:

| File | Covers |
|------|--------|
| `DataWarehouseDomain.test.ts` | Entities (`DataWarehouseEntity`, `Execution`, `ConfigState`, `MetricsSnapshot`) and value objects (`Priority`, `Threshold`, `TimeWindow`) |
| `DataWarehouseExtendedDomain.test.ts` | Repository, mapper, events, handlers, observer, pipeline |
| `DataWarehouseServices.test.ts` | Domain, execution, query, and validation services |
| `DataWarehousePatterns.test.ts` | Specifications (And/Or/Not), access/rate policies, caching & logging decorators |

## Conventions
- `createContext(input)` helper builds a `DataWarehouseContext` (`{ input, metadata: {}, timestamp }`).
- Strategy tests are table-driven over `{ name, cls }` pairs — add new strategies to the table rather than writing new test blocks.
- No external services needed: repository is in-memory, adapters are in-memory/mock/stub.
