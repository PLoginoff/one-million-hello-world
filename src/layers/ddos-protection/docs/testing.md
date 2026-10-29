# Testing: DdosProtection Layer

## Running tests

```bash
bun test ./src/layers/ddos-protection/
```

## Test files

`__tests__/` — one file per detector plus the layer contract:

| File | Covers |
|------|--------|
| `SynFloodDetector.test.ts` | Half-open counting, syn/established ratio flagging |
| `SlidingWindowZScore.test.ts` | Baseline building, z-score anomaly flagging |
| `ConnectionStateTracker.test.ts` | TCP state transitions, exhaustion limits |
| `AdaptiveRateLimiter.test.ts` | AIMD backoff under load, additive recovery |
| `IpReputation.test.ts` | Score accumulation, block/challenge bands, decay |
| `GeoBlocker.test.ts` | CIDR matching, country verdicts |
| `ProofOfWorkChallenge.test.ts` | Issue/solve/verify, difficulty work factor |
| `DdosProtectionEngine.test.ts` | Detector composition, highest-severity verdict merging |
| `DdosProtection.test.ts` | `execute()` result shape, error path, metrics |
| `DdosProtectionStrategies.test.ts` | Five generic strategies + `DdosProtectionStrategyFactory` |
| `DdosProtectionConfiguration.test.ts` | Config builder/validator, defaults |

`domain/__tests__/` — `DdosProtectionDomain`, `ExtendedDomain`, `Services`, `Patterns` cover entities, value objects, services, repository, events, handlers, decorators, observer, pipeline, policies, and specifications.

## Conventions
- Detectors are deterministic: tests inject `TrafficEvent` sequences and assert verdicts — no network or real GeoIP data needed.
- `ProofOfWorkChallenge` tests use low difficulty to keep runtime bounded.
