# ADR: Facade Layer

## Status
Accepted

## Context
Layer 22 needs to present a simplified interface over multiple operations — aggregation and composition with an auditable record of what ran.

## Decisions

### 1. One `execute(operations[])` entry point
`IFacade.execute()` takes an array of `() => Promise<T>` operations, runs them **sequentially**, and returns `FacadeResult<T[]> { success, data?, operations, error? }`. `operations` names each executed step (`operation_0`, `operation_1`, …) so callers can see how far the pipeline got before failure.

### 2. Sequential over parallel
Operations run in order — facade composition implies ordering dependencies; parallel execution would break that contract.

*Alternative rejected:* `Promise.all` — loses ordering and the partial-failure report.

### 3. Partial results on failure
On error the result still reports `operations` executed before the failure — the audit trail survives exceptions, which is the point of a facade over a multi-step process.

### 4. Config-gated aggregation/composition
`FacadeConfig { enableAggregation, enableComposition }` (both default `true`) — the two behaviors are independently toggleable at runtime via `setConfig()`.

### 5. Non-throwing results
Errors return `{ success: false, error: string }` — a facade must report which step failed, not propagate an anonymous exception.

## Consequences
- Auditable multi-step execution with partial-failure visibility
- Sequential only — no parallelism within one `execute()` call
- Standard strategies/domain model give the same composability as other layers
