/**
 * Strategy Engine — public exports.
 *
 * @module StrategyLayer/Engine
 */

export {
  StrategyEngineError,
  ExperimentNotFoundError,
  UnknownVariantError,
  SystemEngineClock,
  ManualEngineClock,
  fnv1a32,
} from './types';
export type { StrategyEngineClock } from './types';
export { AbTestingEngine } from './AbTestingEngine';
export type {
  VariantDef,
  ExperimentDef,
  VariantStats,
  SignificanceResult,
} from './AbTestingEngine';
export { CanaryEvaluator } from './CanaryEvaluator';
export type { RampStep, CanaryState } from './CanaryEvaluator';
export { KillSwitch } from './KillSwitch';
export type { KillRecord, KillAuditEntry } from './KillSwitch';
export { VariantLeaderboard } from './VariantLeaderboard';
export type { VariantObservation, LeaderboardOptions, VariantMetrics } from './VariantLeaderboard';
export { EpsilonGreedyBandit } from './EpsilonGreedyBandit';
export type { BanditArm, BanditOptions } from './EpsilonGreedyBandit';
export { ExperimentLifecycle, InvalidTransitionError } from './ExperimentLifecycle';
export type { ExperimentPhase, TransitionRecord } from './ExperimentLifecycle';
export { FeatureFlagRouter } from './FeatureFlagRouter';
export type { RouteDecision } from './FeatureFlagRouter';
export { ThompsonSamplingBandit } from './ThompsonSamplingBandit';
export type { ThompsonArm, ThompsonOptions } from './ThompsonSamplingBandit';
export { SegmentTargeter } from './SegmentTargeter';
export type { ConditionOp, Condition, Segment, EvalContext } from './SegmentTargeter';
