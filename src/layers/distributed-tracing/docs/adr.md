# ADR: DistributedTracing Layer

## Status
Accepted

## Decisions

### 1. Uniform `execute(context)` contract
Trace operations (span creation, export, context propagation) flow through `execute(DistributedTracingContext)` so tracing composes into the same pipeline machinery as the layers it observes.

### 2. Batched and reliable export strategies
Span export is the volume problem in tracing — `batch` aggregates for throughput, `reliable` guarantees delivery for audit-critical traces, `fast` drops guarantees for low-overhead sampling paths. Priority/`canHandle` selection picks per context.

### 3. Non-throwing results
A tracing layer must never crash the request it observes: failures return `DistributedTracingResult { success: false, error }` and are counted in `failureCount` metrics.

### 4. Exporter adapters as the extension point
In-memory/mock/stub adapters ship in-repo; a real OTLP/Jaeger exporter plugs in behind the adapter interface without changing the domain model or strategies.

### 5. Metrics self-observation
The layer records `successCount`/`failureCount`/`lastExecutionTime` and ships a Prometheus collector — tracing infrastructure should itself be observable.
