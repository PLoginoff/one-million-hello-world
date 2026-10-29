# ADR: DdosProtection Layer

## Status
Accepted

## Decisions

### 1. Composable detector pipeline over a monolith
Each detection technique is a separate `IDetector` (SYN flood, z-score, connection state, adaptive rate limit, reputation, geo, proof-of-work). `DdosProtectionEngine` registers them and merges verdicts with highest-severity winning.

*Rationale:* deployments enable only the detectors matching their threat model; each detector is independently testable and tunable.

### 2. Statistical anomaly detection instead of fixed thresholds only
`SlidingWindowZScore` builds a baseline (μ, σ) from past windows and flags `z > zThreshold`; `AdaptiveRateLimiter` uses AIMD congestion control rather than a static cap. Fixed thresholds alone can't distinguish a flash crowd from an attack.

### 3. Stateful per-source tracking with decay
`IpReputation` and `ConnectionStateTracker` keep per-source state; reputation scores decay with a half-life so transient misbehavior doesn't permanently black-hole clients.

### 4. Hashcash proof-of-work as a challenge tier
`ProofOfWorkChallenge` implements issue/solve/verify with exponential work factor (~2^difficulty) using a pure-TypeScript SHA-256 — no native crypto dependency, deployable anywhere.

### 5. Geo-blocking as an explicit extension point
`GeoBlocker` ships a static CIDR table rather than shipping or downloading a MaxMind database; the lookup interface is the production seam.

### 6. Dual API surface
The uniform `IDdosProtection.execute(context)` contract (shared with all pipeline layers) coexists with the detector `inspect(event)` API — the layer contract feeds orchestration; the engine feeds the traffic path.
