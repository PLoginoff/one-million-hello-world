# Testing: Data Transformation Layer

## Running tests

```bash
bun test ./src/layers/data-transformation/
```

## Actual test files

`__tests__/`:

| File | Covers |
|------|--------|
| `DataTransformer.test.ts` | `getConfig`/`setConfig`; `normalize` (string trimming/lowercasing, skip-when-disabled); `enrich` (field merge, skip-when-disabled); `map` (rule application, transform functions, missing-source-field failure) |
| `DataTransformationStrategies.test.ts` | Five strategies + `DataTransformationStrategyFactory` |
| `DataTransformationConfiguration.test.ts` | Config builder/validator, defaults |

`domain/__tests__/`:

| File | Covers |
|------|--------|
| `DataTransformationExtendedDomain.test.ts` | Repository, mapper, events, handlers, observer, pipeline |
| `DataTransformationServices.test.ts` | Domain/execution/query/validation services |
| `DataTransformationPatterns.test.ts` | Specifications, policies, decorators |

## Conventions
- Tests construct records and rules inline — no fixtures or external data sources.
- Disabled-step behavior is asserted explicitly (data passes through unchanged).
