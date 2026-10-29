# Anomaly Detection Layer Architecture

## Responsibility

Anomaly detection over numeric series with statistical and ML methods.
The layer exposes both the standard layer contract
(`IAnomalyDetection.execute`) and a set of concrete detector
implementations under `implementations/`.

## Public contract

`interfaces/IAnomalyDetection.ts` — `execute(context)`, `configure`,
`getStatus`. `implementations/AnomalyDetection.ts` is a thin reference
implementation (`execute` echoes input/metadata, `configure` marks it
initialized, `getStatus` exposes `layer`/`initialized`/`configKeys`);
the detectors below are the real value of the layer.

## Detectors (`implementations/detectors/`)

All detectors work on `DataPoint { timestamp, value }` series or
`FeatureVector` rows and return `Anomaly { index, score, ... }`.

### Univariate statistical (`StatisticalDetectors.ts`)

- `ZScoreDetector` — |z| > threshold.
- `IqrDetector` — outside `[Q1 - k·IQR, Q3 + k·IQR]`.
- `GrubbsDetector` — iterative Grubbs test for a single outlier.
- Helpers: `mean`, `variance`, `stddev`, `median`, `mad`, `quantile`,
  `inverseNormalCdf`.

### Streaming (`StreamingDetectors.ts`)

Point-by-point detectors for live series:

- `MovingAverageDetector` — deviation from a trailing window mean.
- `EwmaDetector` — EWMA of mean and variance.
- `CusumDetector` — cumulative-sum change detector.

### Multivariate (`IsolationForest.ts`, `multivariate/Gaussian.ts`)

- `IsolationForest` — Liu–Ting–Zhou isolation forest: random partitions,
  anomalies isolate in fewer splits; `cFactor` normalizes path length.
- `MahalanobisDetector` with `fitGaussian` — Mahalanobis-distance
  scoring with regularized inverse covariance (`invertMatrix`),
  `chiSquaredPValue`/`normalCdf`/`erf` helpers.

### Seasonal (`Seasonal.ts`)

- `seasonalDecompose` — additive trend/season/residual via centered
  moving average and period means.
- `SeasonalDetector`, `RobustSeasonalDetector` — flag large residuals.

### Drift (`drift/DriftDetectors.ts`)

Distribution-shift detectors for streaming data:

- `PageHinkleyTest` — cumulative deviation vs `lambda` threshold.
- `KolmogorovSmirnovDetector` + `ksStatistic` — two-sample KS between a
  reference and a sliding window.
- `ArAnomalyDetector` — autoregressive residual detector.

### Clustering (`clustering/Dbscan.ts`)

- `Dbscan` — density clustering; points labeled `-1` (noise) are
  reported as anomalies.
- `LofDetector` — Local Outlier Factor on top of the same distance
  functions.
- `euclideanDistance`/`manhattanDistance` — pluggable `DistanceFn`s.

## Generic layer machinery

The layer also carries the standard skeleton: five strategies
(`default`, `fast`, `reliable`, `cached`, `batch` — see
`AnomalyDetectionStrategyFactory`), a DDD domain module
(entities `AnomalyDetectionEntity`/`AnomalyDetectionExecution`/
`AnomalyDetectionConfigState`/`AnomalyDetectionMetricsSnapshot`, value
objects `AnomalyDetectionThreshold`/`TimeWindow`/`Priority`, services,
specifications, policies, in-memory repository, processing pipeline,
decorators, event handlers), adapters (`InMemory`, `Mock`, `Stub`),
configuration builders/validators, `AnomalyDetectionMetricsCollector`,
`AnomalyDetectionPrometheusMetricsCollector` and
`AnomalyDetectionHealthCheck`.
