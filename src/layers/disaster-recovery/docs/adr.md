# ADR: DisasterRecovery Layer

## Status
Accepted

## Decisions

### 1. Uniform `execute(context)` contract
Drills, failover, and recovery all flow through `execute(DisasterRecoveryContext)` so DR orchestration sits in the same pipeline shape as every other layer — DR plans can be triggered by the same machinery that runs normal operations.

### 2. Initialization-gated implementation
`DisasterRecovery` tracks an `_initialized` flag — failover orchestration refuses to run before the layer is configured, a guard against half-initialized DR execution.

### 3. Strategy variants for drill vs real failover
`fast` and `reliable` strategies share the interface: drills run the fast path (no durability guarantees needed), real failover runs reliable (every step confirmed). Same pipeline, different execution semantics.

### 4. Non-throwing results
Failures surface as `DisasterRecoveryResult { success: false, error }` — during an actual disaster you need structured failure information, not exceptions.

### 5. In-memory domain model
Recovery plans, executions, and metrics snapshots live in the in-memory domain model; durable plan storage is an adapter concern added downstream.
