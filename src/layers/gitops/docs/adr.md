# ADR: Gitops Layer

## Status
Accepted

## Decisions

### 1. Uniform `execute(context)` contract
Reconciliation runs through `execute(GitopsContext)` so sync loops compose with scheduling and deployment layers — the GitOps control loop is a pipeline stage like any other.

### 2. Batch reconciliation as a strategy
Multi-environment/multi-repo sweeps are the normal GitOps operating mode — `batch` is a named strategy, not a loop in caller code.

### 3. Reliable strategy for applies
Applying manifests to production requires confirmed execution — `reliable` carries durability semantics at the strategy boundary.

### 4. Drift and failure as domain events
`GitopsExecuted`/`GitopsFailed` are emitted from the domain — drift detection and apply failures are events other layers (notification, audit) subscribe to, not log lines.

### 5. Non-throwing results
`execute()` returns `{ success: false, error: { code: 'GITOPS_EXECUTION_ERROR' } }` — a failed sync reports structured state for the next reconcile loop rather than throwing through the controller.

### 6. Provider adapters as the seam
Git and Kubernetes interactions sit behind adapters; only in-memory implementations ship in-repo.
