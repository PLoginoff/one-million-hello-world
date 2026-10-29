# Failure Handling

Failures are recorded inside `implementations/CircuitBreaker.ts`; there
is no separate `FailureHandler` class.

## What counts as a failure

`execute(operation, fallback?)` calls `await operation()`. Any thrown
error (sync or rejected promise) is caught and routed to
`_onFailure()`. A *successful* fallback after a failed operation still
counts as a failure of the primary operation — the failure was already
recorded before the fallback ran.

## `_onFailure()` behaviour

```ts
private _onFailure(): void {
  this._stats.failureCount++;
  this._stats.lastFailureTime = Date.now();
  this._successCount = 0;

  if (this._stats.failureCount >= this._config.failureThreshold) {
    this._state = CircuitState.OPEN;
    this._lastStateChange = Date.now();
  }
}
```

- `failureCount` is cumulative across the circuit's lifetime (or until
  `reset()` / a half-open close).
- `successCount` is zeroed so a single failure cancels a half-open
  recovery probe.
- Crossing `failureThreshold` (default `5`) opens the circuit and stamps
  `_lastStateChange`, which starts the `resetTimeout` window.

## Timeout handling

There is no separate `TimeoutManager`. `config.timeout` is stored and
returned by `getConfig()`; the implementation does not itself race the
operation against a timer — call sites that need a hard deadline should
wrap `operation` in their own `Promise.race`/`AbortSignal` logic.

## Error propagation

- Circuit open, no fallback → `{ success: false, error: 'Circuit is
  open', state: OPEN }`.
- Operation throws, fallback succeeds → `{ success: true, data:
  fallbackResult, state }` (the primary error is swallowed by design).
- Operation throws, fallback throws or absent → `{ success: false,
  error: <primary message>, state }`.
