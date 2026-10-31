/**
 * Analytics Engine2 — public exports.
 *
 * @module AnalyticsLayer/Engine2
 */

export * from './types';

/**
 * Module map:
 *
 *  SlidingWindowAggregator — per-metric ring-buffer windows, top-N
 *    heavy hitters (bounded-space Space-Saving-style eviction) and
 *    sparkline series; the real-time dashboard backbone.
 *  EventTracker            — schema-validated custom event intake
 *    with deterministic per-subject sampling (FNV-1a keyed) and
 *    per-schema intake statistics.
 *  AttributionModeler      — first/last/linear/time-decay/position
 *    conversion credit over sorted touchpoint journeys; lookback
 *    windows via binary search.
 *  DashboardComposer       — declarative panel specs rendered into
 *    immutable snapshots across the aggregator, tracker and modeler.
 *  SamplingProfiler        — reservoir sampling (Algorithm R) plus a
 *    weighted-centroid digest for streaming percentile estimates.
 *  AnomalyScorer           — seasonal baseline decomposition
 *    (hour-of-day / hour-of-week / day-of-week) with EWMA
 *    mean/variance z-scoring per season slot.
 *  TrafficShiftModeler     — sequential A/B testing: mSPRT-style
 *    log-likelihood ratio with Wald bounds, plus classic z/Welch
 *    p-values for reference.
 *  SessionWindowGrouper    — gap-timeout sessionization with
 *    per-session and aggregate engagement stats.
 */
export { SlidingWindowAggregator } from './SlidingWindowAggregator';
export { EventTracker, DefaultRandomSource, SequenceRandomSource } from './EventTracker';
export type { RandomSource, EventTrackerOptions } from './EventTracker';
export { AttributionModeler } from './AttributionModeler';
export {
  SamplingProfiler,
  ReservoirSampler,
  CentroidDigest,
  DefaultProfileRandom,
  SequenceProfileRandom,
} from './SamplingProfiler';
export type {
  ProfileRandom,
  ReservoirOptions,
  DigestOptions,
  ProfilerOptions,
  DistributionSummary,
} from './SamplingProfiler';
export { DashboardComposer } from './DashboardComposer';
export { AnomalyScorer } from './AnomalyScorer';
export type { AnomalyScorerOptions, AnomalyScore, SeasonKind } from './AnomalyScorer';
export { TrafficShiftModeler, normalCdf, zToP } from './TrafficShiftModeler';
export type { ShiftTestOptions, ShiftVerdict, ShiftStatus } from './TrafficShiftModeler';
export { SessionWindowGrouper } from './SessionWindowGrouper';
export type { SessionWindowOptions, SessionWindow, SessionStats } from './SessionWindowGrouper';
export type {
  DashboardComposerOptions,
  DashboardDefinition,
  DashboardPanel,
  DashboardSnapshot,
  CounterPanel,
  SparklinePanel,
  TopNPanel,
  EventCountPanel,
  AttributionPanel,
  RenderedPanel,
  RenderedCounter,
  RenderedSparkline,
  RenderedTopN,
  RenderedEventCount,
  RenderedAttribution,
} from './DashboardComposer';
