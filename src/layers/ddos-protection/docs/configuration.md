# Configuration: DdosProtection Layer

## Layer defaults
`DEFAULT_DDOSPROTECTION_CONFIG` (`configuration/defaults/`):

```ts
{ enabled: true, timeout: 30000, retries: 3, logLevel: 'info' }
```

`configure()` merges `Record<string, unknown>` over current config. Build/validate with `DdosProtectionConfigurationBuilder` and `DdosProtectionConfigurationValidator`.

## Detector parameters
Each detector takes its own options object at construction. Key knobs:

| Detector | Option | Effect |
|----------|--------|--------|
| `SynFloodDetector` | `halfOpenThreshold` | Half-open connections per source before flagging |
| `SlidingWindowZScore` | `zThreshold`, window length, `bucketCount` | Anomaly sensitivity; larger windows catch slow-and-low attacks |
| `AdaptiveRateLimiter` | `baseRatePerSec`, `loadThreshold`, `backoffFactor`, `minRatePerSec` | AIMD behavior: per-source tokens/sec, global load trigger, multiplicative decrease, recovery floor |
| `ConnectionStateTracker` | per-source / global `established` limits | Connection-exhaustion detection |
| `IpReputation` | `blockThreshold`, `challengeThreshold`, half-life | Score bands and rehabilitation rate |
| `GeoBlocker` | CIDR table of blocked countries | `block` for listed ISO codes, `allow` otherwise |
| `ProofOfWorkChallenge` | `difficulty`, expiry | Leading-zero-bits required (~2^d work), challenge lifetime |

## Engine wiring
```ts
const engine = new DdosProtectionEngine();
engine.register(new SynFloodDetector({ halfOpenThreshold: 128 }));
engine.register(new AdaptiveRateLimiter({ baseRatePerSec: 50 }));
const verdict = engine.inspect(event); // 'allow' | 'challenge' | 'block'
```

## Status inspection
`getStatus()` → `{ config, metrics, active }`; metrics include `successCount`, `failureCount`, `lastExecutionTime`.
