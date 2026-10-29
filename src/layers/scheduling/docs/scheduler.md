# Job Scheduler

Real implementation in `src/layers/scheduling/scheduler/`.

## Pipeline

```
JobDefinition (cron | once)
   → CronSchedule.nextAfter → JobQueue (min-heap, (fireAt, priority, seq))
   → tick() pops due entries
   → gates: enabled? deps satisfied? under concurrency limit?
   → missed-slot backfill per missedRunPolicy
   → JobExecutor.run → timeout race + retry policy → ExecutionRecord
```

## Cron

Standard 5-field (`min hour dom month dow`), `*` / lists / ranges / steps.
DOM/DOW use classic **OR** semantics when both restricted.

**DST:** all times are UTC — no DST transitions exist, so a job can never
be skipped or double-fired by a clock change. A "2:30am local" semantic
needs a zone-aware cron (out of scope); UTC is the documented model.

## Pull-based dispatch

The scheduler owns no timers — the host calls `tick()` on its own cadence
and everything due runs. `nextDueAt()` tells the host when to wake next.

## Missed runs

The queue only stores the NEXT fire time, so after downtime a job surfaces
as a single due entry. `missedRunPolicy` controls catch-up:

| policy | behavior |
|--------|----------|
| `skip-all` (default) | run once for the current slot |
| `skip-one` | run once for the most recent missed slot |
| `run-all` | run once per missed slot (backfill) |

Missed slots = cron fire times in (dueFireAt, now] that elapsed while the
scheduler wasn't ticking, plus slots blocked by the concurrency limit.

## Dependencies & concurrency

- `dependsOn`: a job may only fire when every dependency's last execution
  succeeded; cycles rejected at registration.
- `concurrency`: max simultaneous executions per job (default 1).
