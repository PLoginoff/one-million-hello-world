# Onboarding Flow Engine

Real implementation in `src/layers/onboarding/flow/`.

## Pipeline

```
FlowDefinition (step graph)
   → registerFlow → FlowGraph (validate: dup ids, resolvable edges,
                                variant stepOrder permutation)
   → start(flowId, userId, ctx)
        → assignVariant (FNV-1a hash → deterministic A/B bucket)
        → resolveOrder (variant order, requiredWhen filtered)
        → FlowRun persisted in RunStore
   → complete / skip / abandon / resume
        → validate hook → mark step → follow next/branch edge
        → auto-skip steps whose requiredWhen now fails
   → FunnelTracker records enter/complete/skip/fail per step
   → ReminderScheduler: cadence [24h, 72h, 168h] on idle runs
```

## Step graph

- `next: StepId` — linear edge
- `next: Branch[]` — first `when(ctx)` match wins; no match ends the flow
- `skippable: true` — may be skipped by the user
- `requiredWhen` — excluded from the resolved order when false
- `validate` — returns error string to fail the step (blocks advancement)

## Resumability

`RunStore.snapshot` serializes a run to a JSON-safe shape; `restore`
rehydrates it — a fresh engine can resume mid-flow from durable storage.

## Funnel

Keyed by stepId (not position) so variant orders share a funnel.
`passRate = (completed+skipped) / entered`; `worstStep` finds the
biggest drop-off; `completionRate` = last-step pass / first-step entered.

## Reminders

A run is eligible while `in-progress` and idle past a cadence step.
One reminder per step per run; activity (resume/complete) cancels pending.
