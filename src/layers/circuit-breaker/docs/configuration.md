# Configuration: Circuit Breaker Layer

Two config shapes exist — the layer-level
`CircuitBreakerConfig` and the circuit's own `CircuitConfig`.

## Layer config (`CircuitBreakerDefaults.ts`)

```json
{
  "enabled": true,
  "timeout": 30000,
  "retries": 3,
  "logLevel": "info"
}
```

Build with `CircuitBreakerConfigurationBuilder`; validate with
`CircuitBreakerConfigurationValidator`; apply via `configure(config)`.

## Circuit config (`types/circuit-breaker-types.ts`)

```ts
interface CircuitConfig {
  failureThreshold: number;  // failures before OPEN (default 5)
  successThreshold: number;  // half-open successes before CLOSE (default 2)
  timeout: number;           // stored; not enforced by execute()
  resetTimeout: number;      // ms before OPEN → HALF_OPEN (default 30000)
}
```

The running instance's defaults: `failureThreshold 5`,
`successThreshold 2`, `timeout 60000`, `resetTimeout 30000`.

## Named profiles (`configuration/defaults/CircuitDefaults.ts`)

`CircuitDefaults` provides environment presets built on a
`CircuitThreshold` value object (adds `slidingWindowSize` and
`minimumRequests` to `CircuitConfig`):

| Profile | failure | success | timeout | resetTimeout | window | min req |
|---------|---------|---------|---------|--------------|--------|---------|
| `getDevelopment()`  | 10  | 1  | 30000 | 10000 | 50    | 5   |
| `getProduction()`   | `CircuitThreshold.createDefault()` | — | — | — | 1000 | — |
| `getHighTraffic()`  | 100 | 10 | 60000 | 30000 | 10000 | 100 |
| `getLowLatency()`   | 3   | 2  | 10000 | 5000  | 20    | 3   |

Each also sets `enableMetrics`, `enableLogging`,
`enableSlidingWindow` and a top-level `slidingWindowSize`.

## Validators

`CircuitConfigValidator` and `CircuitBreakerConfigurationValidator`
(`configuration/validators/`) enforce ranges (`timeout` > 0, thresholds
≥ 1) before `setConfig`/`configure`.
