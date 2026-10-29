# ADR: EtlPipeline Layer

## Status
Accepted

## Decisions

### 1. Uniform `execute(context)` contract
ETL jobs flow through `execute(EtlPipelineContext)` so pipeline orchestration composes with scheduling and data-transformation layers using the same `Context → Result` shape.

### 2. Batch as a first-class strategy
ETL is inherently bulk-oriented — `batch` is a named strategy (priority 3) rather than a config flag, so bulk runs select explicitly via `canHandle`/priority instead of being a mode of `default`.

### 3. Reliability strategy for non-idempotent sinks
`reliable` exists for pipelines where partial loads can't be rolled back — the strategy boundary, not the caller, carries the durability semantics.

### 4. Non-throwing results
`execute()` returns `{ success: false, error: { code: 'ETLPIPELINE_EXECUTION_ERROR' } }` — a failed job reports structured errors for retry/replay instead of throwing through the scheduler.

### 5. Connectors as adapters
Source/sink connectors are the adapter seam; only in-memory implementations ship in-repo, keeping the domain model free of driver dependencies.
