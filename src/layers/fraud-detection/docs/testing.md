# Testing: FraudDetection Layer

## Running tests

```bash
bun test ./src/layers/fraud-detection/
```

## Test files

`__tests__/`:

| File | Covers |
|------|--------|
| `FraudEngine.test.ts` | Engine aggregation: rule signals → weighted score → approve/review/decline; blocklist/allowlist overrides |
| `FraudExtended.test.ts` | Concrete rules (velocity, amount anomaly, impossible travel, device), `FeatureExtractor`/`LogisticScorer`, `LinkAnalysis` clusters, `DeviceSignals` |
| `FraudDetection.test.ts` | `IFraudDetection` contract: `execute()` result shape, error path, `getStatus()` |
| `FraudDetectionStrategies.test.ts` | Five generic strategies + `FraudDetectionStrategyFactory` |
| `FraudDetectionConfiguration.test.ts` | Config builder/validator, defaults |

`domain/__tests__/` — `FraudDetectionDomain`, `ExtendedDomain`, `Services`, `Patterns` cover the domain model.

## Conventions
- Tests construct `Transaction`/`UserProfile` fixtures directly — impossible-travel cases are built from lat/lon + timestamp pairs; no external data.
- `LogisticScorer` tests train on small synthetic sets rather than loading model files.
