# ADR: Governance Layer

## Status
Accepted

## Decisions

### 1. Low-layer placement
Governance sits at Layer 4 so policy evaluation is available to everything above it — compliance checks aren't an afterthought bolted onto the top of the stack.

### 2. Specifications as the policy model
Compliance rules compose via And/Or/Not `IGovernanceSpecification`s rather than a bespoke rules DSL — boolean composition covers most policy shapes and stays testable.

### 3. Policies as first-class domain objects
`GovernanceAccessPolicy`/`RatePolicy` live in `domain/policies/` — access control and rate governance are domain concepts, not middleware details.

### 4. Violations as domain events
`GovernanceExecuted`/`GovernanceFailed` are emitted for downstream audit/alerting — governance decisions must be observable to be enforceable.

### 5. Batch strategy for compliance sweeps
Per-request checks use `fast`; periodic whole-fleet compliance scans use `batch` — same interface, different execution semantics.

### 6. Non-throwing results
`execute()` returns `GovernanceResult { success, data?, error? }` — a denied policy check is a result, not an exception.
