# FraudDetection Layer Architecture

## Position
Layer 72. Responsibility: fraud detection — scores transactions and emits approve / review / decline decisions from composable rules, ML scoring, device signals, and link analysis.

## Fraud Engine (`implementations/fraud/`)
`FraudEngine` aggregates `IFraudRule` signals into a weighted risk score, applies blocklist/allowlist overrides, and returns a `RiskAssessment` with a `RiskDecision` (`approve`/`review`/`decline`). Rules consume a `FraudRuleContext` (`Transaction`, `UserProfile`) and emit `RiskSignal`s.

`Rules.ts` — concrete rules:

- **Velocity checks** — transaction counts/amounts over 1h/24h windows
- **Amount anomaly** — z-score vs the user's history
- **Impossible travel** — haversine distance between consecutive transaction locations vs elapsed time
- **Device fingerprint signals** — mismatched/spoofed fingerprints
- **Blocklist** and **amount-threshold** rules

## ML Scoring (`implementations/ml/`)
`FeatureExtractor` maps a transaction to a fixed feature vector (`amount_log`, `amount_z`, `txn_count_1h`, `txn_count_24h`, …). `LogisticScorer` is a logistic-regression model trained by gradient descent — an ML path alongside the rule engine.

## Link Analysis (`implementations/network/`)
`LinkAnalysis` builds a bipartite user ↔ attribute graph (`deviceId`, `ipAddress`, `merchantId`) and finds communities sharing infrastructure — fraud-ring / mule detection via `SharedAttributeCluster`s.

## Device Signals (`implementations/signals/`)
`DeviceSignals`: fingerprint similarity scoring (partial-match catches spoofed/emulated devices), IP analysis (subnet churn, datacenter heuristics), session-behavior signals.

## Layer Contract
`IFraudDetection` (`interfaces/`): `execute(context)`, `configure(config)`, `getStatus()`. `FraudDetection` (`implementations/FraudDetection.ts`) returns `FraudDetectionResult` (`{ success, data?, error? }`, code `FRAUDDETECTION_EXECUTION_ERROR`) and tracks `successCount`/`failureCount`/`lastExecutionTime`.

## Generic Processing Strategies
`default`, `fast`, `reliable`, `cached`, `batch` — `IFraudDetectionStrategy` implementations via `FraudDetectionStrategyFactory`.

## Domain Model (`domain/`)
Entities (`FraudDetectionEntity`, `ConfigState`, `Execution`, `MetricsSnapshot`), value objects, domain/execution/query/validation services, events, handlers, in-memory repository, mapper, decorators, observer, pipeline, policies, specifications.

## Supporting
- `adapters/` — InMemory, Mock, Stub
- `configuration/` — builders, `DEFAULT_FRAUDDETECTION_CONFIG`, validators
- `health/`, `metrics/` (Prometheus), `statistics/`, `utils/` (`FraudDetectionError`, `FraudDetectionErrorMapper`)
