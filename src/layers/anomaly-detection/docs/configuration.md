# Configuration: Anomaly Detection Layer

## Layer defaults

`configuration/defaults/AnomalyDetectionDefaults.ts` exports
`AnomalyDetectionDEFAULTS`:

```json
{
  "enabled": true,
  "timeout": 30000,
  "retries": 3,
  "logLevel": "info",
  "strategy": "default",
  "maxConcurrentExecutions": 100,
  "cacheEnabled": true,
  "cacheTtlMs": 60000,
  "metricsEnabled": true,
  "healthCheckEnabled": true,
  "healthCheckIntervalMs": 30000
}
```

`AnomalyDetectionLIMITS` bounds the tunables (`timeout` 1000–300000,
`retries` 0–10, `maxConcurrentExecutions` ≤ 1000,
`cacheTtlMs` ≤ 3600000). `AnomalyDetectionSTRATEGIES` lists
`['default','fast','reliable','cached','batch']`.

## Detector options

Each detector takes an options object; the defaults below come from the
implementation files.

- `ZScoreOptions { threshold }` — default `3`.
- `IqrOptions { multiplier }` — IQR multiplier (default 1.5, Tukey).
- `GrubbsOptions { alpha }` — significance level, default `0.05`.
- `MovingAverageOptions { window, threshold }` — trailing window size and
  deviation cut-off.
- `EwmaOptions { alpha, threshold, warmup }` — EWMA smoothing,
  detection threshold, warm-up samples.
- `CusumOptions { reference, threshold, baselineWindow }` — drift
  reference (k), decision interval (h) and baseline size.
- `IsolationForestOptions { trees, subsampleSize, maxDepth, seed,
  threshold }` — defaults `subsampleSize=256`, `threshold=0.6`,
  `maxDepth=ceil(log2 subsampleSize)`.
- `SeasonalDetectorOptions { period, threshold }`, `StlLikeOptions`
  for the robust variant.
- `PageHinkleyOptions { delta, lambda, alpha }` — defaults
  `delta=0.005`, `lambda=50`, `alpha=0.9999`.
- `MahalanobisDetector` is configured by `fitGaussian(samples,
  regularization=1e-6)`.

## Building layer config

`AnomalyDetectionConfigurationBuilder` (fluent `with*` methods) produces
the layer config; `AnomalyDetectionConfigurationValidator` enforces
`AnomalyDetectionLIMITS`. Pass the result to `layer.configure(config)`
or select a strategy through `AnomalyDetectionStrategyFactory.create(name)`.
