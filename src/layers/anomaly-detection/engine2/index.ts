/**
 * Anomaly Detection Engine 2 — public surface.
 *
 * Online z-score via Welford, weighted ensemble detection, concept-drift
 * reweighting, feature attribution and P² threshold auto-tuning.
 *
 * @module AnomalyDetection/Engine2
 */

export { OnlineZScoreDetector, WelfordEstimator } from './Welford';
export type { OnlineScore, WelfordOptions } from './Welford';

export { DetectorAdapter, EnsembleDetector, toAnomaly } from './Ensemble';
export type {
  EnsembleMember,
  EnsembleOptions,
  EnsembleResult,
  EnsembleVote,
  IScoringDetector,
} from './Ensemble';

export { ConceptDriftAdapter } from './DriftAdaptation';
export type { AdaptationOptions, IDriftMonitor } from './DriftAdaptation';

export { LeaveOneOutExplainer, ZScoreExplainer } from './Explainer';
export type { Explanation, FeatureContribution } from './Explainer';

export { MedianMadDetector, RingBuffer } from './RobustStats';
export type { RobustOptions, RobustScore } from './RobustStats';

export { P2Quantile, ThresholdTuner } from './ThresholdTuner';
export type { ThresholdTunerOptions } from './ThresholdTuner';
