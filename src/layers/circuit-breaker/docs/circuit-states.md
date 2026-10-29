# Circuit States

The layer models the classic three-state circuit breaker in
`types/circuit-breaker-types.ts`:

```ts
enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}
```

`implementations/CircuitBreaker.ts` holds the transitions; there is no
separate `StateManager` class — the implementation mutates `_state` and
`_lastStateChange` directly.

## Transitions

- **CLOSED → OPEN**: on each `execute()` failure, `_onFailure()`
  increments `stats.failureCount`. When `failureCount` reaches
  `config.failureThreshold` (default `5`), the state becomes `OPEN`.
- **OPEN → HALF_OPEN**: `execute()` first checks
  `_shouldAttemptReset()` — true once `Date.now() - _lastStateChange >=
  config.resetTimeout` (default `30000` ms). On true, the state moves to
  `HALF_OPEN` and the call is allowed through.
- **HALF_OPEN → CLOSED**: a successful call in `HALF_OPEN` triggers
  `_onSuccess()`; once `successCount` reaches
  `config.successThreshold` (default `2`) the circuit closes and stats
  reset.
- **HALF_OPEN → OPEN**: a failure while half-open re-opens the circuit
  and restarts the `resetTimeout` window.

## Behaviour per state

- `CLOSED` — `execute(operation, fallback?)` calls `operation()`. On
  success `_onSuccess()`; on throw `_onFailure()` and, if a `fallback`
  was provided, its result is returned instead.
- `OPEN` — `execute()` short-circuits: if a `fallback` is supplied its
  result is returned, otherwise `{ success: false, error: 'Circuit is
  open', state: OPEN }`.
- `HALF_OPEN` — behaves like `CLOSED` for the probe call; success/failure
  decides the next transition.

## Pluggable transitions

`strategies/state-transition/StateTransitionStrategy.ts` provides
`DefaultStateTransitionStrategy` implementing
`IStateTransitionStrategy` — the same transition rules factored behind
an interface so callers can substitute custom policies.

## Reset

`circuitBreaker.reset()` forces `CLOSED` and zeroes `failureCount`,
`successCount` and `lastFailureTime`.
