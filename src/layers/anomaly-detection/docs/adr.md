# ADR: Anomaly Detection Layer

## Status

Accepted

## ADR-1: Multiple detector families behind a common shape

**Context.** No single algorithm covers all anomaly shapes: point
outliers, level shifts, seasonal deviations, multivariate outliers and
concept drift need different math.

**Decision.** Group detectors by input model: univariate batch
(`ZScore`, `Iqr`, `Grubbs`), streaming (`MovingAverage`, `Ewma`,
`Cusum`), multivariate (`IsolationForest`, `Mahalanobis`), seasonal
(`SeasonalDetector`, `RobustSeasonalDetector`), drift (`PageHinkley`,
`KolmogorovSmirnov`, `ArAnomaly`) and clustering (`Dbscan`, `Lof`).

**Consequences.** Callers pick the family that matches their data shape;
the shared `DataPoint`/`Anomaly`/`IBatchDetector`/`IStreamingDetector`
types keep them interchangeable. Cost: more code paths to test.

## ADR-2: Pure, stateless where possible — explicit state where not

**Context.** Batch detectors should be pure; streaming/drift detectors
must carry per-series state.

**Decision.** Batch detectors are stateless functions of the input
series. Streaming detectors (`EwmaDetector`, `CusumDetector`,
`PageHinkleyTest`, `KolmogorovSmirnovDetector`) keep small bounded
internal state and update on each `update(point)` call.

**Consequences.** Batch detectors are trivially testable; streaming
detectors need lifecycle care (one instance per series). Documented in
each class's options.

## ADR-3: IsolationForest + Mahalanobis for multivariate, not a neural net

**Context.** Multivariate anomaly detection could use autoencoders, but
the codebase has no ML runtime dependency and must run in-process.

**Decision.** `IsolationForest` (partition-based, no training data
distribution assumptions) and `MahalanobisDetector` (parametric
Gaussian) cover the multivariate case with zero dependencies.

**Consequences.** Both run in O(n) or O(n·trees) with plain math;
interpretable scores; no model files. Cost: no deep-learning accuracy on
highly non-linear manifolds.

## ADR-4: Standard strategy/domain skeleton retained alongside detectors

**Context.** The layer still plugs into the uniform layer machinery
(strategies, domain, adapters, health, metrics).

**Decision.** Keep the generated skeleton (`default`/`fast`/`reliable`/
`cached`/`batch` strategies, DDD domain module, adapters, config,
metrics, health check) and add the detectors as an extra implementation
folder rather than replacing the contract.

**Consequences.** The layer presents the same interface as every other
layer (`IAnomalyDetection.execute`) while exposing richer algorithms to
callers that need them.
