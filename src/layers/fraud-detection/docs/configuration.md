# Configuration: FraudDetection Layer

## Layer defaults
`DEFAULT_FRAUDDETECTION_CONFIG` (`configuration/defaults/`):

```ts
{ enabled: true, timeout: 30000, retries: 3, logLevel: 'info' }
```

`configure()` merges `Record<string, unknown>`; `FraudDetectionConfigurationBuilder` and validator provide typed construction.

## Engine wiring
Rules are `IFraudRule` implementations registered on `FraudEngine`; each emits weighted `RiskSignal`s that aggregate into a score mapped to `approve` / `review` / `decline` bands. Blocklist/allowlist overrides run before banding.

Key rule-level knobs:

| Rule | Tuning |
|------|--------|
| Velocity | 1h / 24h count and amount windows |
| Amount anomaly | z-score threshold vs user history |
| Impossible travel | max plausible speed (haversine distance ÷ elapsed time) |
| Device signals | fingerprint similarity threshold; IP/datacenter heuristics |
| Amount threshold | absolute decline/review amounts |
| Blocklist | exact-match overrides |

## ML path
`LogisticScorer` wraps a weight vector over `FEATURE_NAMES` (`amount_log`, `amount_z`, `txn_count_1h`, `txn_count_24h`, …); train via its gradient-descent routine or supply weights. It's a second opinion, not the decision-maker.

## Link analysis
`LinkAnalysis` accepts which `LinkAttribute`s (`deviceId`, `ipAddress`, `merchantId`) connect users into `SharedAttributeCluster`s.

## Status inspection
`getStatus()` → `{ config, metrics, active }` with `successCount`/`failureCount`/`lastExecutionTime`.
