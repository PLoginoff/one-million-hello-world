# ADR: FeatureFlags Layer

## Status
Accepted

## Decisions

### 1. Uniform `execute(context)` contract
Flag evaluation goes through `execute(FeatureFlagsContext)` so checks compose into the pipeline — the same shape used by every other layer, with flag name + targeting attributes carried in `input`/`metadata`.

### 2. Cached evaluation for hot paths
Flags are read on every request — the `cached` strategy memoizes user+flag evaluations; `fast` serves latency-critical checks; `batch` evaluates whole flag sets for bootstrap payloads.

### 3. Fail-closed result shape
`execute()` returns `FeatureFlagsResult { success, data?, error? }` — on evaluation failure the caller gets `success: false` with `FEATUREFLAGS_EXECUTION_ERROR` and decides the safe default, rather than the layer throwing into the request path.

### 4. Targeting via domain policies
Rollout/targeting logic maps onto `FeatureFlagsAccessPolicy`/`RatePolicy` and And/Or/Not specifications — composable predicates instead of one-off targeting DSLs.

### 5. Provider adapters as the seam
In-memory adapters ship in-repo; real flag backends (LaunchDarkly, Unleash, custom) plug into the adapter interface.
