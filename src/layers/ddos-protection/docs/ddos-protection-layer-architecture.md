# DDoS Protection Layer Architecture

## Position
Layer 74. Responsibility: DDoS detection and mitigation — inspects `TrafficEvent`s and emits allow / challenge / block verdicts.

## Detection Engine (`strategies/`)
`DdosProtectionEngine` composes every registered `IDetector` into one `inspect(event)` call: each event is pushed through all detectors and results are merged with the highest-severity verdict winning. Detectors are independent and composable — register any subset for the threat model you need.

| Detector | Technique |
|----------|-----------|
| `SynFloodDetector` | Tracks TCP handshake state per source; flags when half-open (`syn-received`) count exceeds `halfOpenThreshold` or the syn/established ratio explodes |
| `SlidingWindowZScore` | Per-source request-rate anomaly detection: sliding window split into buckets, z-score vs baseline mean/std, flags `z > zThreshold`. Catches HTTP floods and tuned "slow-and-low" attacks |
| `ConnectionStateTracker` | Per-source TCP state machine (SYN_RECEIVED → ESTABLISHED → closed/reset); flags connection-exhaustion distributions and global saturation |
| `AdaptiveRateLimiter` | Per-source token buckets with AIMD-shared refill rate: multiplicative decrease under load, additive recovery — the TCP congestion-control scheme applied globally |
| `IpReputation` | Persistent per-source score; `block`/`challenge`/`allow` bands with half-life decay so transient mistakes rehabilitate (RBL-style) |
| `GeoBlocker` | Static CIDR table keyed by ISO country code; longest-prefix-match; extension point for a real MaxMind DB |
| `ProofOfWorkChallenge` | Hashcash-style challenge: client must find a nonce such that `SHA256(seed + nonce)` has `difficulty` leading zero bits (pure-TS SHA-256, no crypto dep) |

## Layer Contract
`IDdosProtection` (`interfaces/`): `execute(context)`, `configure(config)`, `getStatus()` — same `Context → Result` shape as other pipeline layers. `DdosProtection` (`implementations/`) records `successCount`/`failureCount`/`lastExecutionTime` metrics per call; failures return `{ success: false, error: { code: 'DDOSPROTECTION_EXECUTION_ERROR' } }`.

## Generic Processing Strategies
Alongside the detectors, the layer ships the standard five `IDdosProtectionStrategy` implementations — `default`, `fast`, `reliable`, `cached`, `batch` — created via `DdosProtectionStrategyFactory`.

## Domain Model (`domain/`)
Entities (`DdosProtectionEntity`, `ConfigState`, `Execution`, `MetricsSnapshot`), value objects (`Priority`, `Threshold`, `TimeWindow`), services (domain/execution/query/validation), events (`DdosProtectionExecuted`/`Failed`), handlers, in-memory repository, mapper, decorators, observer, processing pipeline, access/rate policies, And/Or/Not specifications.

## Supporting
- `adapters/` — InMemory, Mock, Stub
- `configuration/` — builders, `DEFAULT_DDOSPROTECTION_CONFIG`, validators
- `factories/` — `DdosProtectionFactory`, `DdosProtectionStrategyFactory`
- `health/`, `metrics/` (Prometheus), `statistics/`, `utils/` (error + error mapper)
