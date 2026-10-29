# Testing: Anomaly Detection Layer

## Test files

Top-level (`__tests__/`):

- `AnomalyDetection.test.ts` — the `IAnomalyDetection` contract
  (`execute`, `configure`, `getStatus`).
- `AnomalyDetectionStrategies.test.ts` — the five generic strategies and
  `AnomalyDetectionStrategyFactory`.
- `AnomalyDetectionConfiguration.test.ts` — defaults, builder, validator.
- `Detectors.test.ts`, `DetectorsExtended.test.ts` — the real algorithm
  coverage: univariate (ZScore/Iqr/Grubbs), streaming (MovingAverage/
  Ewma/Cusum), `IsolationForest`, seasonal decomposition, drift detectors
  (PageHinkley, KS, AR) and clustering (`Dbscan`, `Lof`).

Domain (`domain/__tests__/`):

- `AnomalyDetectionDomain.test.ts` — entities, value objects, domain
  service.
- `AnomalyDetectionExtendedDomain.test.ts` — specifications, policies,
  repository, pipeline.
- `AnomalyDetectionServices.test.ts` — execution/query/validation
  services.
- `AnomalyDetectionPatterns.test.ts` — mapper, decorators, observer.

## Running

From the repository root:

```bash
bun test ./src/layers/anomaly-detection/
```

or the detectors only:

```bash
bun test ./src/layers/anomaly-detection/__tests__/Detectors.test.ts
```

## Conventions

- All detectors are deterministic — `IsolationForest` accepts a `seed`
  so tests are reproducible.
- No external services: adapters are the in-memory/mock/stub variants.
- Detector tests build synthetic series in the test body; there are no
  fixture files.
