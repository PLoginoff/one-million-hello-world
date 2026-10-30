/**
 * Performance Testing Engine — public surface.
 *
 * Virtual-user load simulation with ramp/spike/soak schedules,
 * reservoir-sampled latency percentiles, sliding throughput windows,
 * error-rate thresholds, and Welch t-test baseline regression analysis.
 *
 * @module PerformanceTesting/Engine
 */

export {
  ReservoirSampler,
  SlidingThroughputWindow,
  ErrorRateTracker,
  mulberry32,
  randInt,
  randExponential,
  welchTTest,
  regularizedBeta,
  lgamma,
} from './Metrics';
export type {
  LatencySnapshot,
  ErrorClass,
  ErrorEvent,
} from './Metrics';

export {
  LoadSchedule,
  VirtualUser,
  ConstantThinkTime,
  UniformThinkTime,
  ExponentialThinkTime,
  pickScenario,
  seededRand,
} from './LoadModel';
export type {
  LoadStage,
  ThinkTime,
  VUState,
  Scenario,
  ScenarioHandler,
} from './LoadModel';

export {
  LoadEngine,
  simulateLoad,
  ScenarioTimeout,
} from './LoadEngine';
export type {
  Threshold,
  ThresholdOp,
  ThresholdMetric,
  ThresholdResult,
  RequestSample,
  TimelinePoint,
  LoadTestReport,
  LoadEngineOptions,
} from './LoadEngine';

export {
  HdrHistogram,
  ArrivalRateModel,
} from './Histogram';
export {
  LatencyAnalyzer,
  CapacityEstimator,
  ReportRenderer,
  TrendTracker,
} from './Analysis';

export {
  lognormal,
  pareto,
  normal,
  mixture,
  withJitter,
  dependencyChain,
  cacheModel,
  stampedeCache,
  apiWorkload,
  dbWorkload,
} from './Workloads';
export type { LatencySampler, FanoutMode, CacheModelOptions } from './Workloads';
export type {
  DistributionAnalysis,
  CapacityEstimate,
  TrendPoint,
} from './Analysis';
export type { HistogramOptions, Arrival } from './Histogram';

export {
  captureBaseline,
  BaselineComparator,
  BaselineStore,
  cohensD,
} from './BaselineRegression';
export type {
  PerformanceBaseline,
  MetricComparison,
  RegressionVerdict,
  RegressionReport,
  CompareOptions,
} from './BaselineRegression';
